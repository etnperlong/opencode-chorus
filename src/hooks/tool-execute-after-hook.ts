import type { ChorusMcpClient } from "../chorus/mcp-client"
import type { OpenCodeChorusConfig } from "../config/schema"
import type { PlanningLifecycle } from "../lifecycle/planning-lifecycle"
import { normalizeChorusToolName, planningPatchForTool } from "../planning/planning-tool-hooks"
import { resolvePlanningSessionId } from "../planning/planning-rules"
import { parseVerdict } from "../reviewers/review-parser"
import { PROPOSAL_REVIEWER_AGENT, TASK_REVIEWER_AGENT } from "../reviewers/reviewer-agents"
import { dispatchProposalReviewer, dispatchTaskReviewer } from "../reviewers/reviewer-dispatcher"
import { attachReviewerGateResult, attachReviewerMetadata } from "../reviewers/reviewer-output"
import { waitForReviewerVerdict } from "../reviewers/reviewer-waiter"
import { beginReviewRound, persistReviewJobId, persistReviewVerdict } from "../reviewers/review-sync"
import type { StateStore } from "../state/state-store"
import { extractStringField, parseJsonObject } from "../util/json-utils"

type ToolExecuteAfterInput = {
  tool: string
  args: unknown
  sessionID: string
}

type ToolExecuteAfterOutput = {
  title: string
  output: string
  metadata: unknown
}

type CreateToolExecuteAfterHookOptions = {
  config: Pick<
    OpenCodeChorusConfig,
    | "enableProposalReviewer"
    | "enableTaskReviewer"
    | "maxProposalReviewRounds"
    | "maxTaskReviewRounds"
    | "reviewerWaitTimeoutMs"
    | "reviewerPollIntervalMs"
    | "reviewGateOutputMode"
  >
  stateStore: StateStore
  planningLifecycle: PlanningLifecycle
  context: {
    client: Parameters<typeof dispatchProposalReviewer>[0]["client"]
    directory: string
  }
  chorusClient: ChorusMcpClient
}

export function createToolExecuteAfterHook(options: CreateToolExecuteAfterHookOptions) {
  return async (input: ToolExecuteAfterInput, output: ToolExecuteAfterOutput): Promise<void> => {
    const tool = normalizeChorusToolName(input.tool)
    const planningPatch = planningPatchForTool(tool)
    if (planningPatch) {
      const state = await options.stateStore.readOpenCodeState()
      const sessionId = resolvePlanningSessionId(
        input.sessionID,
        state.mainSession.runtimeSessionId,
        options.stateStore.paths.stateFile,
      )
      await options.planningLifecycle.ensureScope(sessionId)
      await options.planningLifecycle.markTodo(sessionId, planningPatch)
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
      const state = await options.stateStore.readOpenCodeState()
      const existing = state.reviews[targetKey]
      if (existing?.lastReviewJobId && input.sessionID !== existing.lastReviewJobId) return
      if (existing?.status === "reviewing" && !existing.lastReviewJobId) return

      await persistReviewVerdict(
        options.stateStore,
        targetKey,
        verdict,
        existing?.lastReviewJobId ? { expectedReviewJobId: input.sessionID } : {},
      )
    }

    if (tool === "chorus_pm_submit_proposal" && options.config.enableProposalReviewer) {
      const proposalUuid =
        extractStringField(input.args, "proposalUuid") ??
        extractStringField(parseJsonObject(output.output), "proposalUuid")
      if (!proposalUuid) return

      const targetKey = `proposal:${proposalUuid}`
      const review = await beginReviewRound(options.stateStore, targetKey, options.config.maxProposalReviewRounds)
      if (review?.status === "escalated") {
        attachReviewerGateResult(output, { status: "escalated" }, review.lastReviewJobId ?? "unavailable", {
          round: review.currentRound,
          maxRounds: review.maxRounds,
          mode: options.config.reviewGateOutputMode,
          targetType: "proposal",
          targetUuid: proposalUuid,
          commentToolName: "chorus_get_comments",
        })
        return
      }

      const reviewJobId = await dispatchProposalReviewer({
        client: options.context.client,
        directory: options.context.directory,
        targetUuid: proposalUuid,
        round: review.currentRound,
        maxRounds: review.maxRounds,
        parentSessionID: input.sessionID,
        onSessionCreated: async (sessionId) => {
          const persisted = await persistReviewJobId(options.stateStore, targetKey, sessionId, {
            expectedRound: review.currentRound,
          })
          if (!persisted) throw new Error("Review round changed before reviewer prompt started")
        },
      })
      attachReviewerMetadata(output, "Chorus proposal review", PROPOSAL_REVIEWER_AGENT, reviewJobId)

      const waitResult = await waitForReviewerVerdict({
        stateStore: options.stateStore,
        client: options.chorusClient,
        targetType: "proposal",
        targetUuid: proposalUuid,
        targetKey,
        timeoutMs: options.config.reviewerWaitTimeoutMs,
        pollIntervalMs: options.config.reviewerPollIntervalMs,
        reviewJobId,
      })
      attachReviewerGateResult(output, waitResult, reviewJobId, {
        round: review.currentRound,
        maxRounds: review.maxRounds,
        mode: options.config.reviewGateOutputMode,
        targetType: "proposal",
        targetUuid: proposalUuid,
        commentToolName: "chorus_get_comments",
      })
    }

    if (tool === "chorus_submit_for_verify" && options.config.enableTaskReviewer) {
      const taskUuid = extractStringField(input.args, "taskUuid")
      if (!taskUuid) return

      const targetKey = `task:${taskUuid}`
      const review = await beginReviewRound(options.stateStore, targetKey, options.config.maxTaskReviewRounds)
      if (review?.status === "escalated") {
        attachReviewerGateResult(output, { status: "escalated" }, review.lastReviewJobId ?? "unavailable", {
          round: review.currentRound,
          maxRounds: review.maxRounds,
          mode: options.config.reviewGateOutputMode,
          targetType: "task",
          targetUuid: taskUuid,
          commentToolName: "chorus_get_comments",
        })
        return
      }

      const reviewJobId = await dispatchTaskReviewer({
        client: options.context.client,
        directory: options.context.directory,
        targetUuid: taskUuid,
        round: review.currentRound,
        maxRounds: review.maxRounds,
        parentSessionID: input.sessionID,
        onSessionCreated: async (sessionId) => {
          const persisted = await persistReviewJobId(options.stateStore, targetKey, sessionId, {
            expectedRound: review.currentRound,
          })
          if (!persisted) throw new Error("Review round changed before reviewer prompt started")
        },
      })
      attachReviewerMetadata(output, "Chorus task review", TASK_REVIEWER_AGENT, reviewJobId)

      const waitResult = await waitForReviewerVerdict({
        stateStore: options.stateStore,
        client: options.chorusClient,
        targetType: "task",
        targetUuid: taskUuid,
        targetKey,
        timeoutMs: options.config.reviewerWaitTimeoutMs,
        pollIntervalMs: options.config.reviewerPollIntervalMs,
        reviewJobId,
      })
      attachReviewerGateResult(output, waitResult, reviewJobId, {
        round: review.currentRound,
        maxRounds: review.maxRounds,
        mode: options.config.reviewGateOutputMode,
        targetType: "task",
        targetUuid: taskUuid,
        commentToolName: "chorus_get_comments",
      })
    }
  }
}
