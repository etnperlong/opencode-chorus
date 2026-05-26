import type { ChorusMcpClient } from "../chorus/mcp-client"
import { resolveChorusToolScope, type ChorusToolScope } from "../chorus/tool-scope"
import type { OpenCodeChorusConfig } from "../config/schema"
import type { PlanningLifecycle } from "../lifecycle/planning-lifecycle"
import { normalizeChorusToolName, planningPatchForTool } from "../planning/planning-tool-hooks"
import { resolvePlanningSessionId } from "../planning/planning-rules"
import { parseVerdict } from "../reviewers/review-parser"
import { buildReviewTargetSignature } from "../reviewers/review-target-signature"
import { PROPOSAL_REVIEWER_AGENT, TASK_REVIEWER_AGENT } from "../reviewers/reviewer-agents"
import { dispatchProposalReviewer, dispatchTaskReviewer } from "../reviewers/reviewer-dispatcher"
import { attachReviewerGateResult, attachReviewerMetadata } from "../reviewers/reviewer-output"
import { extractReviewTargetDisplayName } from "../reviewers/reviewer-toast"
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

type ReviewerToast = {
  started(input: {
    reviewJobId: string
    targetType: "proposal" | "task"
    displayName: string
    round: number
    maxRounds: number
  }): Promise<void>
  finished(input: {
    reviewJobId: string
    targetType: "proposal" | "task"
    displayName: string
    round: number
    maxRounds: number
    result: Awaited<ReturnType<typeof waitForReviewerVerdict>>
  }): Promise<void>
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
  reviewerToast?: ReviewerToast
}

export function createToolExecuteAfterHook(options: CreateToolExecuteAfterHookOptions) {
  return async (input: ToolExecuteAfterInput, output: ToolExecuteAfterOutput): Promise<void> => {
    const effective = resolveEffectiveToolCall(input.tool, input.args)
    const tool = effective.tool
    const args = effective.args
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
      const targetType = extractStringField(args, "targetType")
      if (targetType !== "proposal" && targetType !== "task") return

      const targetUuid = extractStringField(args, "targetUuid")
      const content = extractStringField(args, "content")
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
        extractStringField(args, "proposalUuid") ??
        extractStringField(parseJsonObject(output.output), "proposalUuid")
      if (!proposalUuid) return

      const targetKey = `proposal:${proposalUuid}`
      const toolScope = await resolveChorusToolScope(options.stateStore)
      const targetSnapshot = await readTargetSnapshot(options.chorusClient, "proposal", proposalUuid, toolScope)
      if (!targetSnapshot) {
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
        targetSnapshot.signature,
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
      await options.reviewerToast?.started({
        reviewJobId,
        targetType: "proposal",
        displayName: targetSnapshot.displayName,
        round: review.currentRound,
        maxRounds: review.maxRounds,
      })

      const waitResult = await waitForReviewerVerdict({
        stateStore: options.stateStore,
        client: options.chorusClient,
        reviewClient: options.context.client,
        targetType: "proposal",
        targetUuid: proposalUuid,
        targetKey,
        directory: options.context.directory,
        timeoutMs: options.config.reviewerWaitTimeoutMs,
        pollIntervalMs: options.config.reviewerPollIntervalMs,
        reviewJobId,
        scope: toolScope,
      })
      await options.reviewerToast?.finished({
        reviewJobId,
        targetType: "proposal",
        displayName: targetSnapshot.displayName,
        round: review.currentRound,
        maxRounds: review.maxRounds,
        result: waitResult,
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
      const taskUuid = extractStringField(args, "taskUuid")
      if (!taskUuid) return

      const targetKey = `task:${taskUuid}`
      const toolScope = await resolveChorusToolScope(options.stateStore)
      const targetSnapshot = await readTargetSnapshot(options.chorusClient, "task", taskUuid, toolScope)
      if (!targetSnapshot) {
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
        targetSnapshot.signature,
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
      await options.reviewerToast?.started({
        reviewJobId,
        targetType: "task",
        displayName: targetSnapshot.displayName,
        round: review.currentRound,
        maxRounds: review.maxRounds,
      })

      const waitResult = await waitForReviewerVerdict({
        stateStore: options.stateStore,
        client: options.chorusClient,
        reviewClient: options.context.client,
        targetType: "task",
        targetUuid: taskUuid,
        targetKey,
        directory: options.context.directory,
        timeoutMs: options.config.reviewerWaitTimeoutMs,
        pollIntervalMs: options.config.reviewerPollIntervalMs,
        reviewJobId,
        scope: toolScope,
      })
      await options.reviewerToast?.finished({
        reviewJobId,
        targetType: "task",
        displayName: targetSnapshot.displayName,
        round: review.currentRound,
        maxRounds: review.maxRounds,
        result: waitResult,
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

    if (tool === "chorus_admin_verify_task") {
      const taskUuid = extractStringField(args, "taskUuid")
      if (!taskUuid) return

      const toolScope = await resolveChorusToolScope(options.stateStore)
      const reminder = await buildIdeaCompletionReportReminder(options.chorusClient, taskUuid, toolScope)
      if (reminder) attachIdeaCompletionReportReminder(output, reminder)
    }
  }
}

function resolveEffectiveToolCall(tool: string, args: unknown): { tool: string; args: unknown } {
  const normalizedTool = normalizeChorusToolName(tool)
  if (normalizedTool !== "chorus_tool_execute") return { tool: normalizedTool, args }
  const toolName = extractStringField(args, "toolName")
  if (!toolName) return { tool: normalizedTool, args }
  return { tool: normalizeChorusToolName(toolName), args: isRecord(args) ? args.arguments : undefined }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

type IdeaCompletionReportReminder = {
  proposalUuid: string
}

async function readTargetSnapshot(
  client: ChorusMcpClient,
  targetType: "proposal" | "task",
  targetUuid: string,
  scope?: ChorusToolScope,
): Promise<{ signature: string; displayName: string } | undefined> {
  try {
    if (targetType === "proposal") {
      const proposal = await client.callTool("chorus_get_proposal", { proposalUuid: targetUuid }, scope)
      return {
        signature: buildReviewTargetSignature(targetType, proposal),
        displayName: extractReviewTargetDisplayName(targetType, proposal),
      }
    }

    const task = await client.callTool("chorus_get_task", { taskUuid: targetUuid }, scope)
    return {
      signature: buildReviewTargetSignature(targetType, task),
      displayName: extractReviewTargetDisplayName(targetType, task),
    }
  } catch {
    return undefined
  }
}

async function readExistingReview(stateStore: StateStore, targetKey: string) {
  const state = await stateStore.readOpenCodeState()
  return state.reviews[targetKey]
}

async function buildIdeaCompletionReportReminder(
  client: ChorusMcpClient,
  taskUuid: string,
  scope?: ChorusToolScope,
): Promise<IdeaCompletionReportReminder | undefined> {
  try {
    const task = await client.callTool("chorus_get_task", { taskUuid }, scope)
    if (!isRecord(task)) return undefined

    const proposalUuid = normalizeString(task.proposalUuid)
    if (!proposalUuid) return undefined

    const taskProject = isRecord(task.project) ? task.project : undefined
    const projectUuid = normalizeString(taskProject?.uuid)
    if (!projectUuid) return undefined

    const proposal = await client.callTool("chorus_get_proposal", { proposalUuid }, scope)
    if (!isRecord(proposal) || normalizeString(proposal.inputType) !== "idea") return undefined

    const taskPage = await client.callTool(
      "chorus_list_tasks",
      { projectUuid, proposalUuids: [proposalUuid], pageSize: 200 },
      scope,
    )
    const tasks = readCompleteCollection(taskPage, "tasks")
    if (!tasks || tasks.length === 0) return undefined
    if (tasks.some((item) => readTaskStatus(item) !== "done" && readTaskStatus(item) !== "closed")) return undefined

    const documentsPage = await client.callTool(
      "chorus_get_documents",
      { projectUuid, type: "report", pageSize: 200 },
      scope,
    )
    const documents = readCompleteCollection(documentsPage, "documents")
    if (!documents) return undefined
    if (documents.some((item) => normalizeString(item.proposalUuid) === proposalUuid)) return undefined

    return { proposalUuid }
  } catch {
    return undefined
  }
}

function readCompleteCollection(record: unknown, key: "tasks" | "documents"): Array<Record<string, unknown>> | undefined {
  if (!isRecord(record)) return undefined
  const total = typeof record.total === "number" ? record.total : undefined
  const collection = Array.isArray(record[key]) ? record[key].filter(isRecord) : undefined
  if (total === undefined || !collection) return undefined
  if (total > collection.length) return undefined
  return collection
}

function readTaskStatus(value: Record<string, unknown>): string | undefined {
  return normalizeString(value.status)
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

function attachIdeaCompletionReportReminder(
  output: { output: string },
  reminder: IdeaCompletionReportReminder,
): void {
  const nextAction =
    `Call chorus_create_report for proposal ${reminder.proposalUuid}. ` +
    `Follow the tool description for the Summary / Decisions / Follow-ups template.`

  const parsedOutput = parseJsonObject(output.output)
  if (parsedOutput) {
    output.output = JSON.stringify(
      {
        ...parsedOutput,
        ideaCompletionReportReminder: {
          toolName: "chorus_create_report",
          proposalUuid: reminder.proposalUuid,
          nextAction,
        },
      },
      null,
      2,
    )
    return
  }

  output.output = `${output.output}\nIdea-completion report reminder: ${nextAction}`
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
