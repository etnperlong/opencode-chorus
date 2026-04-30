import type { ChorusMcpClient } from "../chorus/mcp-client"
import type { OpenCodeChorusConfig } from "../config/schema"
import type { PlanningLifecycle } from "../lifecycle/planning-lifecycle"
import { normalizeChorusToolName, planningPatchForTool } from "../planning/planning-tool-hooks"
import { resolvePlanningSessionId } from "../planning/planning-rules"
import { parseVerdict } from "../reviewers/review-parser"
import { buildReviewTargetSignature } from "../reviewers/review-target-signature"
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
        existing?.lastReviewJobId
          ? { expectedReviewJobId: input.sessionID, reviewerComment: content }
          : { reviewerComment: content },
      )
    }

    if (tool === "chorus_pm_submit_proposal" && options.config.enableProposalReviewer) {
      const proposalUuid =
        extractStringField(input.args, "proposalUuid") ??
        extractStringField(parseJsonObject(output.output), "proposalUuid")
      if (!proposalUuid) return

      const targetKey = `proposal:${proposalUuid}`
      const targetSignature = await readTargetSignature(options.chorusClient, "proposal", proposalUuid)
      if (!targetSignature) {
        const existing = await readExistingReview(options.stateStore, targetKey)
        if (existing) {
          attachReviewerGateResult(output, toReviewerWaitResult(existing), existing.lastReviewJobId ?? "unavailable", {
            round: existing.currentRound,
            maxRounds: existing.maxRounds,
            mode: options.config.reviewGateOutputMode,
            targetType: "proposal",
            targetUuid: proposalUuid,
            commentToolName: "chorus_get_comments",
          })
          return
        }
        attachReviewerGateResult(
          output,
          {
            status: "interrupted",
            message: "Reviewer could not load the current target snapshot, so no new review round was started.",
          },
          "unavailable",
          {
            mode: options.config.reviewGateOutputMode,
            targetType: "proposal",
            targetUuid: proposalUuid,
            commentToolName: "chorus_get_comments",
          },
        )
        return
      }
      const review = await beginReviewRound(
        options.stateStore,
        targetKey,
        options.config.maxProposalReviewRounds,
        targetSignature,
      )
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
      if (review.status !== "reviewing" || review.lastReviewJobId) {
        attachReviewerGateResult(
          output,
          toReviewerWaitResult(review),
          review.lastReviewJobId ?? "unavailable",
          {
            round: review.currentRound,
            maxRounds: review.maxRounds,
            mode: options.config.reviewGateOutputMode,
            targetType: "proposal",
            targetUuid: proposalUuid,
            commentToolName: "chorus_get_comments",
          },
        )
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
      const targetSignature = await readTargetSignature(options.chorusClient, "task", taskUuid)
      if (!targetSignature) {
        const existing = await readExistingReview(options.stateStore, targetKey)
        if (existing) {
          attachReviewerGateResult(output, toReviewerWaitResult(existing), existing.lastReviewJobId ?? "unavailable", {
            round: existing.currentRound,
            maxRounds: existing.maxRounds,
            mode: options.config.reviewGateOutputMode,
            targetType: "task",
            targetUuid: taskUuid,
            commentToolName: "chorus_get_comments",
          })
          return
        }
        attachReviewerGateResult(
          output,
          {
            status: "interrupted",
            message: "Reviewer could not load the current target snapshot, so no new review round was started.",
          },
          "unavailable",
          {
            mode: options.config.reviewGateOutputMode,
            targetType: "task",
            targetUuid: taskUuid,
            commentToolName: "chorus_get_comments",
          },
        )
        return
      }
      const review = await beginReviewRound(
        options.stateStore,
        targetKey,
        options.config.maxTaskReviewRounds,
        targetSignature,
      )
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
      if (review.status !== "reviewing" || review.lastReviewJobId) {
        attachReviewerGateResult(
          output,
          toReviewerWaitResult(review),
          review.lastReviewJobId ?? "unavailable",
          {
            round: review.currentRound,
            maxRounds: review.maxRounds,
            mode: options.config.reviewGateOutputMode,
            targetType: "task",
            targetUuid: taskUuid,
            commentToolName: "chorus_get_comments",
          },
        )
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

async function readTargetSignature(
  client: ChorusMcpClient,
  targetType: "proposal" | "task",
  targetUuid: string,
): Promise<string | undefined> {
  try {
    if (targetType === "proposal") {
      const proposal = await client.callTool("chorus_get_proposal", { proposalUuid: targetUuid })
      return buildReviewTargetSignature(targetType, proposal)
    }

    const task = await client.callTool("chorus_get_task", { taskUuid: targetUuid })
    return buildReviewTargetSignature(targetType, task)
  } catch {
    return undefined
  }
}

async function readExistingReview(stateStore: StateStore, targetKey: string) {
  const state = await stateStore.readOpenCodeState()
  return state.reviews[targetKey]
}

function toReviewerWaitResult(review: {
  status: "idle" | "reviewing" | "changes-requested" | "approved" | "escalated" | "timed-out" | "interrupted"
  lastVerdict?: "PASS" | "PASS_WITH_NOTES" | "FAIL"
  lastReviewJobId?: string
  lastReviewerComment?: string
}): ReturnType<typeof waitForReviewerVerdict> extends Promise<infer TResult> ? TResult : never {
  if (review.status === "approved" || review.status === "changes-requested") {
    if (!review.lastVerdict) return { status: "timeout" }
    return {
      status: "completed",
      verdict: review.lastVerdict,
      ...(review.lastReviewerComment ? { comment: review.lastReviewerComment } : {}),
    }
  }

  if (review.status === "reviewing") {
    return {
      status: "running",
      message: `Reviewer session ${review.lastReviewJobId ?? "unavailable"} is still running for the current target snapshot.`,
    }
  }
  if (review.status === "escalated") return { status: "escalated" }
  return { status: "timeout" }
}
