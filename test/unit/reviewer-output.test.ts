import { describe, expect, it } from "bun:test"
import type { ReviewerWaitResult } from "../../src/reviewers/reviewer-waiter"
import { attachReviewerGateResult, attachReviewerMetadata } from "../../src/reviewers/reviewer-output"

describe("reviewer output helpers", () => {
  it("adds reviewer metadata to tool output metadata", () => {
    const output: { title: string; metadata: unknown } = { title: "", metadata: { existing: true } }

    attachReviewerMetadata(output, "Chorus proposal review", "proposal-reviewer", "session-123")

    expect(output.title).toBe("Chorus proposal review")
    expect(output.metadata).toEqual({
      existing: true,
      sessionId: "session-123",
      taskId: "session-123",
      agent: "proposal-reviewer",
    })
  })

  it("annotates completed reviewer results and enriches JSON output", () => {
    const waitResult: ReviewerWaitResult = { status: "completed", verdict: "PASS" }
    const output: { output: string; metadata: unknown } = {
      output: JSON.stringify({ proposalUuid: "proposal-1" }),
      metadata: {},
    }

    attachReviewerGateResult(output, waitResult, "review-job-1")

    expect(output.metadata).toEqual({ reviewStatus: "completed", verdict: "PASS" })
    expect(JSON.parse(output.output)).toEqual({
      proposalUuid: "proposal-1",
      reviewer: {
        sessionId: "review-job-1",
        status: "completed",
        verdict: "PASS",
      },
    })
  })

  it("annotates timeout reviewer results and appends plain-text output", () => {
    const waitResult: ReviewerWaitResult = { status: "timeout" }
    const output: { output: string; metadata: unknown } = {
      output: "submitted",
      metadata: { existing: true },
    }

    attachReviewerGateResult(output, waitResult, "review-job-2")

    expect(output.metadata).toEqual({ existing: true, reviewStatus: "timeout" })
    expect(output.output).toContain("Reviewer result:")
    expect(output.output).toContain("review-job-2")
    expect(output.output).toContain("Reviewer did not finish before timeout")
  })
})
