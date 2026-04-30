import { describe, expect, it } from "bun:test"

import type { OpenCodeState, ReviewRecord } from "../state/state-types"
import { nextReviewRound } from "./review-rounds"

describe("review rounds", () => {
  it("allows retry after timeout even when the target signature is unchanged", () => {
    const state = createState({
      "proposal:proposal-1": {
        currentRound: 1,
        maxRounds: 3,
        status: "timed-out",
        lastReviewJobId: "ses_existing",
        lastTargetSignature: "sig-1",
        blockersSnapshot: [],
      },
    })

    const next = nextReviewRound(state, "proposal:proposal-1", 3, "sig-1")

    expect(next.currentRound).toBe(2)
    expect(next.status).toBe("reviewing")
    expect(next.lastReviewJobId).toBeUndefined()
    expect(next.lastTargetSignature).toBe("sig-1")
  })

  it("reuses an unchanged completed review result", () => {
    const state = createState({
      "proposal:proposal-1": {
        currentRound: 1,
        maxRounds: 3,
        status: "approved",
        lastVerdict: "PASS",
        lastReviewJobId: "ses_existing",
        lastTargetSignature: "sig-1",
        blockersSnapshot: [],
      },
    })

    const next = nextReviewRound(state, "proposal:proposal-1", 3, "sig-1")

    expect(next.currentRound).toBe(1)
    expect(next.status).toBe("approved")
    expect(next.lastVerdict).toBe("PASS")
  })

  it("increments the round when the target signature changes", () => {
    const state = createState({
      "proposal:proposal-1": {
        currentRound: 1,
        maxRounds: 3,
        status: "timed-out",
        lastReviewJobId: "ses_existing",
        lastTargetSignature: "sig-1",
        blockersSnapshot: [],
      },
    })

    const next = nextReviewRound(state, "proposal:proposal-1", 3, "sig-2")

    expect(next.currentRound).toBe(2)
    expect(next.status).toBe("reviewing")
    expect(next.lastReviewJobId).toBeUndefined()
    expect(next.lastTargetSignature).toBe("sig-2")
  })
})

function createState(reviews: OpenCodeState["reviews"]): OpenCodeState {
  return {
    version: 1,
    runtime: "opencode",
    updatedAt: new Date(0).toISOString(),
    mainSession: { status: "idle" },
    planningScopes: {},
    workers: {},
    reviews,
    notificationQueue: [],
    checkpoints: {},
  }
}
