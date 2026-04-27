import type { Plugin } from "@opencode-ai/plugin"
import { ChorusMcpClient } from "./chorus/mcp-client"
import { createChorusTools } from "./chorus/tool-registry"
import { resolveConfig } from "./config/schema"
import { PlanningLifecycle } from "./lifecycle/planning-lifecycle"
import { markInterruptedReviews } from "./lifecycle/reviewer-lifecycle"
import { extractSessionEventId, shouldReplaceMainSessionOnStartup, shouldStartMainSession } from "./lifecycle/session-events"
import { SessionLifecycle } from "./lifecycle/session-lifecycle"
import { cleanupOrphanWorkers } from "./lifecycle/worker-lifecycle"
import { enqueueRoutedNotification } from "./notifications/notification-dispatcher"
import { routeNotification } from "./notifications/notification-router"
import { ChorusSseListener, type SseNotificationEvent } from "./notifications/sse-listener"
import { resolvePlanningSessionId } from "./planning/planning-rules"
import { parseVerdict } from "./reviewers/review-parser"
import { beginReviewRound, persistReviewVerdict } from "./reviewers/review-sync"
import { runProposalReviewer } from "./reviewers/proposal-reviewer"
import { runTaskReviewer } from "./reviewers/task-reviewer"
import { StateStore } from "./state/state-store"
import { createLogger } from "./util/logger"

export const createPlugin: Plugin = async (ctx, options) => {
  const logger = createLogger(ctx.client)
  const config = resolveConfig(options ?? {})
  const stateStore = new StateStore(ctx.directory, config.stateDir)
  await stateStore.init()
  const chorusClient = new ChorusMcpClient({
    chorusUrl: config.chorusUrl,
    apiKey: config.apiKey,
  })
  const sessionLifecycle = new SessionLifecycle(stateStore, chorusClient, config.chorusUrl)
  const planningLifecycle = new PlanningLifecycle(stateStore)
  let hasHandledSessionCreated = false
  const notificationListener = new ChorusSseListener(config.chorusUrl, config.apiKey, (event) => {
    void handleNotificationEvent(event).catch((error) =>
      logger.error("Failed to process Chorus notification event", { error: formatError(error) }),
    )
  })

  await logger.info("Initializing opencode-chorus", {
    directory: ctx.directory,
    worktree: ctx.worktree,
    chorusUrl: config.chorusUrl,
  })
  void notificationListener
    .connect()
    .catch((error) => logger.warn("Chorus notification listener stopped", { error: formatError(error) }))

  return {
    tool: createChorusTools(chorusClient),
    event: async ({ event }) => {
      await logger.debug("Observed OpenCode event", { type: event.type })

      if (event.type === "session.created") {
        const sessionId = extractSessionEventId(event)
        if (sessionId) {
          const state = await stateStore.readOpenCodeState()
          const replaceExisting = shouldReplaceMainSessionOnStartup(
            state.mainSession,
            sessionId,
            hasHandledSessionCreated,
          )
          if (config.autoStart && (replaceExisting || shouldStartMainSession(state.mainSession.runtimeSessionId, sessionId))) {
            await cleanupOrphanWorkers(stateStore)
            await markInterruptedReviews(stateStore)
            await sessionLifecycle.start(sessionId, { replaceExisting })
          }
          hasHandledSessionCreated = true
        }
      }
      if (event.type === "session.idle") {
        const sessionId = extractSessionEventId(event)
        if (sessionId) await sessionLifecycle.heartbeat(sessionId)
      }
      if (event.type === "session.deleted") {
        const sessionId = extractSessionEventId(event)
        if (sessionId) await sessionLifecycle.stop(sessionId)
      }
    },
    "tool.execute.after": async (input, output) => {
      const planningPatch = planningPatchForTool(input.tool)
      if (planningPatch) {
        const state = await stateStore.readOpenCodeState()
        const sessionId = resolvePlanningSessionId(input.sessionID, state.mainSession.runtimeSessionId, stateStore.paths.stateFile)
        await planningLifecycle.ensureScope(sessionId)
        await planningLifecycle.markTodo(sessionId, planningPatch)
      }

      if (input.tool === "chorus_pm_submit_proposal" && config.enableProposalReviewer) {
        const proposalUuid =
          extractStringField(input.args, "proposalUuid") ?? extractStringField(parseJsonObject(output.output), "proposalUuid")
        if (!proposalUuid) return

        const reviewText = "### Review Summary\n\nVERDICT: PASS"
        const targetKey = `proposal:${proposalUuid}`
        const review = await beginReviewRound(stateStore, targetKey, config.maxProposalReviewRounds)
        if (review?.status === "escalated") return
        await runProposalReviewer(chorusClient, proposalUuid, reviewText)
        await persistReviewVerdict(stateStore, targetKey, parseVerdict(reviewText))
      }

      if (input.tool === "chorus_submit_for_verify" && config.enableTaskReviewer) {
        const taskUuid = extractStringField(input.args, "taskUuid")
        if (!taskUuid) return

        const reviewText = "### Review Summary\n\nVERDICT: PASS"
        const targetKey = `task:${taskUuid}`
        const review = await beginReviewRound(stateStore, targetKey, config.maxTaskReviewRounds)
        if (review?.status === "escalated") return
        await runTaskReviewer(chorusClient, taskUuid, reviewText)
        await persistReviewVerdict(stateStore, targetKey, parseVerdict(reviewText))
      }
    },
  }

  async function handleNotificationEvent(event: SseNotificationEvent): Promise<void> {
    if (event.type !== "new_notification" || !event.notificationUuid) return

    const notification = await fetchUnreadNotificationByUuid(chorusClient, event.notificationUuid)
    if (!notification) return

    const routed = routeNotification(notification)
    if (routed.kind === "ignored") return

    await enqueueRoutedNotification(stateStore, routed)
  }
}

type ChorusNotification = {
  uuid?: string
  notificationUuid?: string
  action?: string
  entityUuid?: string
  projectUuid?: string
  entityTitle?: string
}

export async function fetchUnreadNotificationByUuid(
  chorusClient: ChorusMcpClient,
  notificationUuid: string,
): Promise<ChorusNotification | undefined> {
  const limit = 50
  const maxPages = 5

  for (let page = 0; page < maxPages; page++) {
    const result = await chorusClient.callTool<unknown>("chorus_get_notifications", {
      status: "unread",
      autoMarkRead: false,
      limit,
      offset: page * limit,
    })
    const notification = findNotification(result, notificationUuid)
    if (notification) return notification
  }
}

function planningPatchForTool(tool: string) {
  if (tool === "chorus_create_proposal") return { proposalExists: true }
  if (tool === "chorus_add_document_draft") return { documentDraftReady: true }
  if (tool === "chorus_add_task_draft") return { taskDraftReady: true }
  if (tool === "chorus_update_task_draft") return { dependenciesReady: true }
  if (tool === "chorus_pm_submit_proposal") return { submittedOrApproved: true }
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text)
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function extractStringField(value: unknown, field: string): string | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined
  const raw = (value as Record<string, unknown>)[field]
  return typeof raw === "string" && raw.length > 0 ? raw : undefined
}

function findNotification(result: unknown, notificationUuid: string): ChorusNotification | undefined {
  return extractNotifications(result).find(
    (notification) => notification.uuid === notificationUuid || notification.notificationUuid === notificationUuid,
  )
}

function extractNotifications(result: unknown): ChorusNotification[] {
  if (Array.isArray(result)) return result.filter(isChorusNotification)
  if (result === null || typeof result !== "object" || Array.isArray(result)) return []

  const notifications = (result as Record<string, unknown>).notifications
  return Array.isArray(notifications) ? notifications.filter(isChorusNotification) : []
}

function isChorusNotification(value: unknown): value is ChorusNotification {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
