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

    expect(output.metadata).toEqual({
      reviewStatus: "completed",
      verdict: "PASS",
      reviewJobId: "review-job-1",
      reviewGateOutputMode: "summary",
      reviewNextAction: "Proceed to admin verification.",
    })
    expect(JSON.parse(output.output)).toEqual({
      proposalUuid: "proposal-1",
      reviewer: {
        sessionId: "review-job-1",
        status: "completed",
        verdict: "PASS",
        nextAction: "Proceed to admin verification.",
      },
    })
  })

  it("adds concise reviewer gate guidance in summary mode", () => {
    const waitResult: ReviewerWaitResult = { status: "completed", verdict: "PASS_WITH_NOTES" }
    const output: { output: string; metadata: unknown } = {
      output: JSON.stringify({ taskUuid: "task-1" }),
      metadata: {},
    }

    attachReviewerGateResult(output, waitResult, "review-job-3", {
      round: 2,
      maxRounds: 3,
      mode: "summary",
    })

    expect(output.metadata).toEqual({
      reviewStatus: "completed",
      verdict: "PASS_WITH_NOTES",
      reviewJobId: "review-job-3",
      reviewRound: 2,
      reviewMaxRounds: 3,
      reviewGateOutputMode: "summary",
      reviewNextAction: "Proceed to admin verification; reviewer notes are non-blocking.",
    })
    expect(JSON.parse(output.output)).toEqual({
      taskUuid: "task-1",
      reviewer: {
        sessionId: "review-job-3",
        status: "completed",
        verdict: "PASS_WITH_NOTES",
        round: 2,
        maxRounds: 3,
        nextAction: "Proceed to admin verification; reviewer notes are non-blocking.",
      },
    })
  })

  it("includes expanded reviewer gate details in detailed mode", () => {
    const waitResult: ReviewerWaitResult = { status: "timeout" }
    const output: { output: string; metadata: unknown } = {
      output: "submitted",
      metadata: {},
    }

    attachReviewerGateResult(output, waitResult, "review-job-4", {
      round: 1,
      maxRounds: 2,
      mode: "detailed",
      targetType: "task",
      targetUuid: "task-1",
      commentToolName: "chorus_get_comments",
    })

    expect(output.metadata).toMatchObject({
      reviewStatus: "timeout",
      reviewJobId: "review-job-4",
      reviewRound: 1,
      reviewMaxRounds: 2,
      reviewGateOutputMode: "detailed",
      reviewNextAction: "Inspect reviewer session review-job-4 or task comments, then retry the reviewer gate or escalate.",
    })
    expect(output.output).toContain("Reviewer gate details:")
    expect(output.output).toContain("Job: review-job-4")
    expect(output.output).toContain("Round: 1/2")
    expect(output.output).toContain("Status: timeout")
    expect(output.output).toContain("Target: task task-1")
    expect(output.output).toContain("Comments: chorus_get_comments")
  })

  it("includes expanded reviewer gate details in detailed mode for JSON output", () => {
    const waitResult: ReviewerWaitResult = { status: "timeout" }
    const output: { output: string; metadata: unknown } = {
      output: JSON.stringify({ proposalUuid: "proposal-1" }),
      metadata: {},
    }

    attachReviewerGateResult(output, waitResult, "review-job-json", {
      round: 1,
      maxRounds: 2,
      mode: "detailed",
      targetType: "proposal",
      targetUuid: "proposal-1",
      commentToolName: "chorus_get_comments",
    })

    expect(JSON.parse(output.output)).toEqual({
      proposalUuid: "proposal-1",
      reviewer: {
        sessionId: "review-job-json",
        status: "timeout",
        round: 1,
        maxRounds: 2,
        nextAction: "Inspect reviewer session review-job-json or proposal comments, then retry the reviewer gate or escalate.",
        message: "Reviewer did not finish before timeout",
        details: {
          jobId: "review-job-json",
          round: 1,
          maxRounds: 2,
          status: "timeout",
          targetType: "proposal",
          targetUuid: "proposal-1",
          commentToolName: "chorus_get_comments",
        },
      },
    })
  })

  it("uses proposal-specific next-action guidance", () => {
    const waitResult: ReviewerWaitResult = { status: "completed", verdict: "FAIL" }
    const output: { output: string; metadata: unknown } = {
      output: JSON.stringify({ proposalUuid: "proposal-fail" }),
      metadata: {},
    }

    attachReviewerGateResult(output, waitResult, "review-job-proposal", {
      mode: "summary",
      targetType: "proposal",
      targetUuid: "proposal-fail",
    })

    expect(output.metadata).toMatchObject({
      reviewNextAction: "Revise the proposal, then resubmit it for review.",
    })
    expect(JSON.parse(output.output).reviewer.nextAction).toBe("Revise the proposal, then resubmit it for review.")
  })

  it("formats escalation guidance without a reviewer verdict", () => {
    const waitResult: ReviewerWaitResult = { status: "escalated" }
    const output: { output: string; metadata: unknown } = {
      output: "submitted",
      metadata: {},
    }

    attachReviewerGateResult(output, waitResult, "review-job-escalated", {
      round: 4,
      maxRounds: 3,
      mode: "summary",
      targetType: "task",
      targetUuid: "task-escalated",
    })

    expect(output.metadata).toMatchObject({
      reviewStatus: "escalated",
      reviewJobId: "review-job-escalated",
      reviewNextAction: "Escalate for human review before retrying this gate.",
    })
    expect(output.output).toContain("Reviewer result:")
    expect(output.output).toContain("Escalate for human review before retrying this gate.")
  })

  it("annotates timeout reviewer results and appends plain-text output", () => {
    const waitResult: ReviewerWaitResult = { status: "timeout" }
    const output: { output: string; metadata: unknown } = {
      output: "submitted",
      metadata: { existing: true },
    }

    attachReviewerGateResult(output, waitResult, "review-job-2")

    expect(output.metadata).toEqual({
      existing: true,
      reviewStatus: "timeout",
      reviewJobId: "review-job-2",
      reviewGateOutputMode: "summary",
      reviewNextAction: "Inspect reviewer session review-job-2 or task comments, then retry the reviewer gate or escalate.",
    })
    expect(output.output).toContain("Reviewer result:")
    expect(output.output).toContain("review-job-2")
    expect(output.output).toContain("Reviewer did not finish before timeout")
  })
})
