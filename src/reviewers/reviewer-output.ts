import type { ReviewerWaitResult } from "./reviewer-waiter"
import type { ReviewGateOutputMode } from "../config/schema"
import { isRecord, parseJsonObject } from "../util/json-utils"

type ReviewerGateOutputOptions = {
  round?: number
  maxRounds?: number
  mode?: ReviewGateOutputMode
  targetType?: "proposal" | "task"
  targetUuid?: string
  commentToolName?: string
}

export function attachReviewerMetadata(
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

export function attachReviewerGateResult(
  output: { output: string; metadata: unknown },
  waitResult: ReviewerWaitResult,
  reviewJobId: string,
  options: ReviewerGateOutputOptions = {},
): void {
  const nextAction = reviewerNextAction(waitResult, reviewJobId, options.targetType)
  const mode = options.mode ?? "summary"
  output.metadata = {
    ...(isRecord(output.metadata) ? output.metadata : {}),
    reviewStatus: waitResult.status,
    reviewJobId,
    ...(options.round !== undefined ? { reviewRound: options.round } : {}),
    ...(options.maxRounds !== undefined ? { reviewMaxRounds: options.maxRounds } : {}),
    reviewGateOutputMode: mode,
    reviewNextAction: nextAction,
    ...(waitResult.status === "completed" ? { verdict: waitResult.verdict } : {}),
  }

  const reviewer = {
    sessionId: reviewJobId,
    status: waitResult.status,
    ...(options.round !== undefined ? { round: options.round } : {}),
    ...(options.maxRounds !== undefined ? { maxRounds: options.maxRounds } : {}),
    nextAction,
    ...(waitResult.status === "completed"
      ? { verdict: waitResult.verdict }
      : { message: waitResult.status === "timeout" ? "Reviewer did not finish before timeout" : "Reviewer gate escalated" }),
    ...(mode === "detailed" ? { details: reviewerDetails(waitResult, reviewJobId, options) } : {}),
  }
  const parsedOutput = parseJsonObject(output.output)
  if (parsedOutput) {
    output.output = JSON.stringify({ ...parsedOutput, reviewer }, null, 2)
    return
  }

  output.output = `${output.output}\n${formatReviewerResult(reviewer, waitResult, reviewJobId, mode, options)}`
}

function reviewerNextAction(waitResult: ReviewerWaitResult, reviewJobId: string, targetType: "proposal" | "task" = "task"): string {
  if (waitResult.status === "escalated") return "Escalate for human review before retrying this gate."
  if (waitResult.status === "timeout") {
    return `Inspect reviewer session ${reviewJobId} or ${targetType} comments, then retry the reviewer gate or escalate.`
  }
  if (targetType === "proposal") {
    if (waitResult.verdict === "FAIL") return "Revise the proposal, then resubmit it for review."
    return "Proceed to proposal approval."
  }
  if (waitResult.verdict === "FAIL") return "Fix reviewer BLOCKERs, then resubmit for verification."
  if (waitResult.verdict === "PASS_WITH_NOTES") return "Proceed to admin verification; reviewer notes are non-blocking."
  return "Proceed to admin verification."
}

function reviewerDetails(
  waitResult: ReviewerWaitResult,
  reviewJobId: string,
  options: ReviewerGateOutputOptions,
): Record<string, unknown> {
  return {
    jobId: reviewJobId,
    ...(options.round !== undefined ? { round: options.round } : {}),
    ...(options.maxRounds !== undefined ? { maxRounds: options.maxRounds } : {}),
    status: waitResult.status,
    ...(waitResult.status === "completed" ? { verdict: waitResult.verdict } : {}),
    ...(options.targetType ? { targetType: options.targetType } : {}),
    ...(options.targetUuid ? { targetUuid: options.targetUuid } : {}),
    ...(options.commentToolName ? { commentToolName: options.commentToolName } : {}),
  }
}

function formatReviewerResult(
  reviewer: Record<string, unknown>,
  waitResult: ReviewerWaitResult,
  reviewJobId: string,
  mode: ReviewGateOutputMode,
  options: ReviewerGateOutputOptions,
): string {
  if (mode === "summary") return `Reviewer result: ${JSON.stringify(reviewer)}`

  return [
    "Reviewer gate details:",
    `Job: ${reviewJobId}`,
    `Round: ${options.round ?? "unknown"}/${options.maxRounds ?? "unknown"}`,
    `Status: ${waitResult.status}`,
    ...(waitResult.status === "completed"
      ? [`Verdict: ${waitResult.verdict}`]
      : [`Message: ${waitResult.status === "timeout" ? "Reviewer did not finish before timeout" : "Reviewer gate escalated"}`]),
    ...(options.targetType && options.targetUuid ? [`Target: ${options.targetType} ${options.targetUuid}`] : []),
    ...(options.commentToolName ? [`Comments: ${options.commentToolName}`] : []),
    `Next action: ${reviewer.nextAction}`,
  ].join("\n")
}
