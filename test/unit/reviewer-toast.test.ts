import { describe, expect, it } from "bun:test"
import type { ReviewerWaitResult } from "../../src/reviewers/reviewer-waiter"
import {
  extractReviewTargetDisplayName,
  ReviewerToastCoordinator,
  reviewerResultVariant,
} from "../../src/reviewers/reviewer-toast"

describe("reviewer toast helpers", () => {
  it("extracts a display name from Chorus target snapshots without falling back to UUIDs", () => {
    expect(extractReviewTargetDisplayName("task", { title: "Implement reviewer toast" })).toBe("Implement reviewer toast")
    expect(extractReviewTargetDisplayName("proposal", { name: "Reviewer UX" })).toBe("Reviewer UX")
    expect(extractReviewTargetDisplayName("task", { taskUuid: "task-123" })).toBe("Untitled task")
  })

  it("maps reviewer results to toast variants", () => {
    expect(reviewerResultVariant({ status: "completed", verdict: "PASS" })).toBe("success")
    expect(reviewerResultVariant({ status: "completed", verdict: "PASS_WITH_NOTES" })).toBe("info")
    expect(reviewerResultVariant({ status: "completed", verdict: "FAIL" })).toBe("warning")
    expect(reviewerResultVariant({ status: "interrupted", message: "missing snapshot" })).toBe("error")
  })

  it("shows concise running and result toasts for a single reviewer", async () => {
    const toasts: ToastCall[] = []
    const coordinator = new ReviewerToastCoordinator({ tui: createTui(toasts) })

    await coordinator.started({
      reviewJobId: "review-job-1",
      targetType: "task",
      displayName: "Implement reviewer toast",
      round: 1,
      maxRounds: 3,
    })
    await coordinator.finished({
      reviewJobId: "review-job-1",
      targetType: "task",
      displayName: "Implement reviewer toast",
      round: 1,
      maxRounds: 3,
      result: { status: "completed", verdict: "PASS" },
    })

    expect(toasts).toEqual([
      {
        title: "Reviewing Implement reviewer toast (round 1/3)",
        message: "Chorus task reviewer is running...",
        variant: "info",
        duration: 300_000,
      },
      {
        title: "Reviewed Implement reviewer toast (round 1/3)",
        message: "PASS",
        variant: "success",
        duration: 4_000,
      },
    ])
  })

  it("aggregates running reviewer toasts when multiple reviewers are active", async () => {
    const toasts: ToastCall[] = []
    const coordinator = new ReviewerToastCoordinator({ tui: createTui(toasts) })

    await coordinator.started({
      reviewJobId: "review-job-1",
      targetType: "task",
      displayName: "Task A",
      round: 1,
      maxRounds: 3,
    })
    await coordinator.started({
      reviewJobId: "review-job-2",
      targetType: "proposal",
      displayName: "Proposal B",
      round: 2,
      maxRounds: 3,
    })
    await coordinator.finished({
      reviewJobId: "review-job-2",
      targetType: "proposal",
      displayName: "Proposal B",
      round: 2,
      maxRounds: 3,
      result: { status: "completed", verdict: "FAIL" },
    })

    expect(toasts).toEqual([
      expect.objectContaining({
        title: "Reviewing Task A (round 1/3)",
        message: "Chorus task reviewer is running...",
      }),
      expect.objectContaining({
        title: "2 Chorus reviewers running",
        message: "- Task A (round 1/3)\n- Proposal B (round 2/3)",
      }),
      expect.objectContaining({
        title: "Reviewed Proposal B (round 2/3)",
        message: "FAIL",
        variant: "warning",
      }),
      expect.objectContaining({
        title: "Reviewing Task A (round 1/3)",
        message: "Chorus task reviewer is running...",
      }),
    ])
  })
})

type ToastCall = {
  title?: string
  message?: string
  variant?: "info" | "success" | "warning" | "error"
  duration?: number
}

function createTui(toasts: ToastCall[]) {
  return {
    showToast: async (input: ToastCall) => {
      toasts.push(input)
    },
  }
}
