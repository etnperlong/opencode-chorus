import { describe, expect, it } from "bun:test"

import { attachReviewerGateResult } from "./reviewer-output"

describe("reviewer output", () => {
  it("attaches the full reviewer comment in detailed mode", () => {
    const output = {
      output: JSON.stringify({ proposalUuid: "proposal-1" }),
      metadata: {},
    }

    attachReviewerGateResult(
      output,
      {
        status: "completed",
        verdict: "FAIL",
        comment: "Review-Job-ID: ses_123\nVERDICT: FAIL\n\nBLOCKER: missing reviewer context",
      },
      "ses_123",
      {
        mode: "detailed",
        targetType: "proposal",
        targetUuid: "proposal-1",
        commentToolName: "chorus_get_comments",
      },
    )

    const parsed = JSON.parse(output.output) as {
      reviewer?: { details?: { comment?: string } }
    }

    expect(parsed.reviewer?.details?.comment).toContain("VERDICT: FAIL")
    expect(parsed.reviewer?.details?.comment).toContain("BLOCKER: missing reviewer context")
  })
})
