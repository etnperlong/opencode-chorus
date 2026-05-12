import type { PluginInput } from "@opencode-ai/plugin"
import type { ChorusMcpClient } from "../chorus/mcp-client"
import type { StateStore } from "../state/state-store"
import {
  claimNextQueuedNotification,
  enqueueRoutedNotification,
  markQueuedNotificationDone,
  markQueuedNotificationFailed,
} from "./notification-dispatcher"
import { fetchUnreadNotificationByUuid, fetchUnreadNotifications } from "./notification-pagination"
import { routeNotification } from "./notification-router"
import { ChorusSseListener, type SseListenerStatus, type SseNotificationEvent } from "./sse-listener"

type Logger = {
  debug(message: string, extra?: Record<string, unknown>): Promise<void>
  info(message: string, extra?: Record<string, unknown>): Promise<void>
  warn(message: string, extra?: Record<string, unknown>): Promise<void>
  error(message: string, extra?: Record<string, unknown>): Promise<void>
}

type NotificationCoordinatorOptions = {
  chorusUrl: string
  apiKey: string
  autoStart: boolean
  enableNotificationHints: boolean
  directory: string
  stateStore: StateStore
  chorusClient: ChorusMcpClient
  client: PluginInput["client"]
  logger: Logger
}

export class NotificationCoordinator {
  private listener: ChorusSseListener | null = null
  private drainPromise: Promise<void> | null = null
  private started = false

  constructor(private readonly options: NotificationCoordinatorOptions) {}

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    this.listener = new ChorusSseListener(this.options.chorusUrl, this.options.apiKey, (event) => {
      void this.handleSseEvent(event).catch((error) =>
        this.options.logger.error("Failed to process Chorus notification event", {
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    }, {
      onReconnect: async () => {
        await this.backfillUnreadNotifications()
      },
      onStatusChange: async (status, error) => {
        await this.updateRuntimeStatus(status, error)
      },
    })

    void this.listener.connect().catch((error) =>
      this.options.logger.warn("Chorus notification listener stopped", {
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  }

  stop(): void {
    this.listener?.disconnect()
  }

  async handleSseEvent(event: SseNotificationEvent): Promise<void> {
    if (event.type !== "new_notification" || !event.notificationUuid) return
    const notification = await fetchUnreadNotificationByUuid(this.options.chorusClient, event.notificationUuid)
    if (!notification) return

    const routed = routeNotification(
      { ...notification, notificationUuid: notification.uuid ?? notification.notificationUuid ?? event.notificationUuid },
      { enableNotificationHints: this.options.enableNotificationHints, autoStart: this.options.autoStart },
    )
    if (routed.kind === "ignored") return

    await enqueueRoutedNotification(this.options.stateStore, routed)
    await this.showToast(routed.title, routed.toastMessage, routed.kind === "task_reopened" || routed.kind === "proposal_rejected" ? "warning" : "info")
    await this.updateRuntimeStatus(this.listener?.status ?? "connected")
  }

  async handleSessionReady(sessionId: string): Promise<void> {
    await this.drain(sessionId)
  }

  async handleSessionIdle(sessionId: string): Promise<void> {
    await this.drain(sessionId)
  }

  private async backfillUnreadNotifications(): Promise<void> {
    const notifications = await fetchUnreadNotifications(this.options.chorusClient)
    for (const notification of notifications) {
      const routed = routeNotification(
        {
          ...notification,
          notificationUuid: notification.uuid ?? notification.notificationUuid,
        },
        { enableNotificationHints: this.options.enableNotificationHints, autoStart: this.options.autoStart },
      )
      if (routed.kind === "ignored") continue
      await enqueueRoutedNotification(this.options.stateStore, routed)
    }

    await this.options.stateStore.updateOpenCodeState((state) => ({
      ...state,
      checkpoints: {
        ...state.checkpoints,
        lastUnreadBackfillAt: new Date().toISOString(),
      },
    }))
  }

  private async drain(sessionId: string): Promise<void> {
    if (this.drainPromise) return this.drainPromise

    const promise = this.performDrain(sessionId)
    this.drainPromise = promise
    try {
      await promise
    } finally {
      if (this.drainPromise === promise) this.drainPromise = null
    }
  }

  private async performDrain(sessionId: string): Promise<void> {
    const state = await this.options.stateStore.readOpenCodeState()
    if (state.mainSession.runtimeSessionId !== undefined && state.mainSession.runtimeSessionId !== sessionId) return

    for (let delivered = 0; delivered < 5; delivered += 1) {
      const next = await claimNextQueuedNotification(this.options.stateStore)
      if (!next) return

      try {
        await this.options.client.session.prompt({
          path: { id: sessionId },
          query: { directory: this.options.directory },
          body: {
            ...(next.delivery === "context_only" ? { noReply: true } : {}),
            parts: [{ type: "text", text: next.prompt }],
          },
        })
        await markQueuedNotificationDone(this.options.stateStore, next.notificationUuid)
      } catch (error) {
        await markQueuedNotificationFailed(
          this.options.stateStore,
          next.notificationUuid,
          error instanceof Error ? error.message : String(error),
        )
        return
      }

      if (next.delivery === "assistant_turn") return
    }
  }

  private async updateRuntimeStatus(status: SseListenerStatus, error?: string): Promise<void> {
    const now = new Date().toISOString()
    await this.options.stateStore.updateOpenCodeState((state) => ({
      ...state,
      notificationRuntime: {
        status,
        ...(state.notificationRuntime?.lastEventAt ? { lastEventAt: state.notificationRuntime.lastEventAt } : {}),
        ...(status === "connected" ? { lastConnectedAt: now } : {}),
        ...(status === "reconnecting" ? { lastReconnectAt: now } : {}),
        ...(status === "connected" || status === "reconnecting" ? { lastEventAt: now } : {}),
        ...(error ? { lastError: error } : {}),
      },
    }))
  }

  private async showToast(title: string, message: string, variant: "info" | "success" | "warning" | "error"): Promise<void> {
    try {
      await this.options.client.tui?.showToast({
        body: {
          title,
          message,
          variant,
          duration: 4_000,
        },
        query: { directory: this.options.directory },
      })
    } catch {
      // Ignore toast delivery issues.
    }
  }
}
