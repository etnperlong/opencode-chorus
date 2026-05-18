import { markInterruptedReviews } from "../lifecycle/reviewer-lifecycle"
import { extractSessionEventId, shouldReplaceMainSessionOnStartup } from "../lifecycle/session-events"
import type { SessionLifecycle } from "../lifecycle/session-lifecycle"
import { cleanupOrphanWorkers } from "../lifecycle/worker-lifecycle"
import type { StateStore } from "../state/state-store"
import type { Logger } from "../util/logger"

type PluginEventPayload = {
  event: {
    type: string
    properties?: unknown
  }
}

type CreatePluginEventHookOptions = {
  autoStart: boolean
  stateStore: StateStore
  sessionLifecycle: SessionLifecycle
  logger: Pick<Logger, "debug" | "info" | "warn">
  onSessionReady?: (sessionId: string) => Promise<void>
  onSessionIdle?: (sessionId: string) => Promise<void>
  onSessionEnded?: (sessionId: string) => Promise<void>
}

export function createPluginEventHook(options: CreatePluginEventHookOptions) {
  let hasHandledSessionStartup = false

  return async ({ event }: PluginEventPayload): Promise<void> => {
    await options.logger.debug("Observed OpenCode event", { type: event.type })

    if (event.type === "session.created" || (event.type === "session.updated" && !hasHandledSessionStartup)) {
      const sessionId = extractSessionEventId(event)
      if (sessionId) {
        const state = await options.stateStore.readOpenCodeState()
        if (shouldReplaceMainSessionOnStartup(state.mainSession, sessionId, hasHandledSessionStartup) || options.autoStart) {
          await cleanupOrphanWorkers(options.stateStore)
          await markInterruptedReviews(options.stateStore)
        }
        await options.onSessionReady?.(sessionId)
        hasHandledSessionStartup = true
      }
    }

    if (event.type === "session.idle") {
      const sessionId = extractSessionEventId(event)
      if (sessionId) {
        await options.sessionLifecycle.heartbeat(sessionId)
        await options.onSessionIdle?.(sessionId)
      }
    }

    if (event.type === "session.deleted") {
      const sessionId = extractSessionEventId(event)
      if (sessionId) {
        await options.sessionLifecycle.stop(sessionId)
        await options.onSessionEnded?.(sessionId)
      }
    }
  }
}
