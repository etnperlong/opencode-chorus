import type { Plugin } from "@opencode-ai/plugin"
import { ChorusMcpClient } from "./chorus/mcp-client"
import { loadChorusConfig } from "./config/config-loader"
import { createPluginConfigApplier } from "./config/plugin-config"
import { MissingRequiredConfigError } from "./config/schema"
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
import { PROPOSAL_REVIEWER_AGENT, TASK_REVIEWER_AGENT } from "./reviewers/reviewer-agents"
import { dispatchProposalReviewer, dispatchTaskReviewer } from "./reviewers/reviewer-dispatcher"
import { waitForReviewerVerdict, type ReviewerWaitResult } from "./reviewers/reviewer-waiter"
import { beginReviewRound, persistReviewJobId, persistReviewVerdict } from "./reviewers/review-sync"
import { StateStore } from "./state/state-store"
import { createLogger } from "./util/logger"

export const createPlugin: Plugin = async (ctx, options) => {
  const logger = createLogger(ctx.client)
  let loadedConfig
  try {
    loadedConfig = await loadChorusConfig(options ?? {})
  } catch (error) {
    if (isMissingRequiredConfigError(error)) {
      return {
        config: createPluginConfigApplier(),
      }
    }
    throw error
  }
  const config = loadedConfig.config
  const applyPluginConfig = createPluginConfigApplier({
    chorusUrl: config.chorusUrl,
    apiKey: config.apiKey,
  })
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

  if (loadedConfig.metadata.apiKeySource === "chorus.json") {
    await logger.warn("Chorus API key was loaded from chorus.json; prefer CHORUS_API_KEY for secrets.")
  }
  await logger.info("Initializing opencode-chorus", {
    directory: ctx.directory,
    worktree: ctx.worktree,
    chorusUrl: config.chorusUrl,
  })
  void notificationListener
    .connect()
    .catch((error) => logger.warn("Chorus notification listener stopped", { error: formatError(error) }))

  return {
    config: applyPluginConfig,
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
      const tool = normalizeChorusToolName(input.tool)
      const planningPatch = planningPatchForTool(tool)
      if (planningPatch) {
        const state = await stateStore.readOpenCodeState()
        const sessionId = resolvePlanningSessionId(input.sessionID, state.mainSession.runtimeSessionId, stateStore.paths.stateFile)
        await planningLifecycle.ensureScope(sessionId)
        await planningLifecycle.markTodo(sessionId, planningPatch)
      }

      if (tool === "chorus_add_comment") {
        const targetType = extractStringField(input.args, "targetType")
        if (targetType !== "proposal" && targetType !== "task") return

        const targetUuid = extractStringField(input.args, "targetUuid")
        const content = extractStringField(input.args, "content")
        if (!targetUuid || !content) return

        let verdict: ReturnType<typeof parseVerdict>
        try {
          verdict = parseVerdict(content)
        } catch {
          return
        }

        const targetKey = `${targetType}:${targetUuid}`
        const state = await stateStore.readOpenCodeState()
        const existing = state.reviews[targetKey]
        if (existing?.lastReviewJobId && input.sessionID !== existing.lastReviewJobId) return
        if (existing?.status === "reviewing" && !existing.lastReviewJobId) {
          return
        }

        await persistReviewVerdict(
          stateStore,
          targetKey,
          verdict,
          existing?.lastReviewJobId ? { expectedReviewJobId: input.sessionID } : {},
        )
      }

      if (tool === "chorus_pm_submit_proposal" && config.enableProposalReviewer) {
        const proposalUuid =
          extractStringField(input.args, "proposalUuid") ?? extractStringField(parseJsonObject(output.output), "proposalUuid")
        if (!proposalUuid) return

        const targetKey = `proposal:${proposalUuid}`
        const review = await beginReviewRound(stateStore, targetKey, config.maxProposalReviewRounds)
        if (review?.status === "escalated") return
        const reviewJobId = await dispatchProposalReviewer({
          client: ctx.client,
          directory: ctx.directory,
          targetUuid: proposalUuid,
          round: review.currentRound,
          maxRounds: review.maxRounds,
          parentSessionID: input.sessionID,
          onSessionCreated: async (sessionId) => {
            const persisted = await persistReviewJobId(stateStore, targetKey, sessionId, {
              expectedRound: review.currentRound,
            })
            if (!persisted) throw new Error("Review round changed before reviewer prompt started")
          },
        })
        attachReviewerMetadata(output, "Chorus proposal review", PROPOSAL_REVIEWER_AGENT, reviewJobId)
        const waitResult = await waitForReviewerVerdict({
          stateStore,
          client: chorusClient,
          targetType: "proposal",
          targetUuid: proposalUuid,
          targetKey,
          timeoutMs: config.reviewerWaitTimeoutMs,
          pollIntervalMs: config.reviewerPollIntervalMs,
          reviewJobId,
        })
        attachReviewerGateResult(output, waitResult, reviewJobId)
      }

      if (tool === "chorus_submit_for_verify" && config.enableTaskReviewer) {
        const taskUuid = extractStringField(input.args, "taskUuid")
        if (!taskUuid) return

        const targetKey = `task:${taskUuid}`
        const review = await beginReviewRound(stateStore, targetKey, config.maxTaskReviewRounds)
        if (review?.status === "escalated") return
        const reviewJobId = await dispatchTaskReviewer({
          client: ctx.client,
          directory: ctx.directory,
          targetUuid: taskUuid,
          round: review.currentRound,
          maxRounds: review.maxRounds,
          parentSessionID: input.sessionID,
          onSessionCreated: async (sessionId) => {
            const persisted = await persistReviewJobId(stateStore, targetKey, sessionId, {
              expectedRound: review.currentRound,
            })
            if (!persisted) throw new Error("Review round changed before reviewer prompt started")
          },
        })
        attachReviewerMetadata(output, "Chorus task review", TASK_REVIEWER_AGENT, reviewJobId)
        const waitResult = await waitForReviewerVerdict({
          stateStore,
          client: chorusClient,
          targetType: "task",
          targetUuid: taskUuid,
          targetKey,
          timeoutMs: config.reviewerWaitTimeoutMs,
          pollIntervalMs: config.reviewerPollIntervalMs,
          reviewJobId,
        })
        attachReviewerGateResult(output, waitResult, reviewJobId)
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

function normalizeChorusToolName(tool: string): string {
  const nativePrefix = "chorus_chorus_"
  if (tool.startsWith(nativePrefix)) return tool.slice("chorus_".length)
  return tool
}

function attachReviewerMetadata(
  output: { title: string; metadata: unknown },
  title: string,
  agent: string,
  sessionId: string,
): void {
  output.title = title
  output.metadata = {
    ...(isRecord(output.metadata) ? output.metadata : {}),
    sessionId,
    taskId: sessionId,
    agent,
  }
}

function attachReviewerGateResult(
  output: { output: string; metadata: unknown },
  waitResult: ReviewerWaitResult,
  reviewJobId: string,
): void {
  output.metadata = {
    ...(isRecord(output.metadata) ? output.metadata : {}),
    reviewStatus: waitResult.status,
    ...(waitResult.status === "completed" ? { verdict: waitResult.verdict } : {}),
  }

  const reviewer = {
    sessionId: reviewJobId,
    status: waitResult.status,
    ...(waitResult.status === "completed"
      ? { verdict: waitResult.verdict }
      : { message: "Reviewer did not finish before timeout" }),
  }
  const parsedOutput = parseJsonObject(output.output)
  if (parsedOutput) {
    output.output = JSON.stringify({ ...parsedOutput, reviewer }, null, 2)
    return
  }

  output.output = `${output.output}\nReviewer result: ${JSON.stringify(reviewer)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
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

function isMissingRequiredConfigError(error: unknown): boolean {
  return error instanceof MissingRequiredConfigError
}
