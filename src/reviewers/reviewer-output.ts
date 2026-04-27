import type { ReviewerWaitResult } from "./reviewer-waiter"
import { isRecord, parseJsonObject } from "../util/json-utils"

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
