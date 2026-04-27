import { describe, expect, it } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beginReviewRound, persistReviewJobId, persistReviewVerdict } from "../../src/reviewers/review-sync"
import { StateStore } from "../../src/state/state-store"

describe("review sync", () => {
  it("persists an escalated round when max rounds are exceeded", async () => {
    const store = await createStore()
    await persistExistingReview(store, "task:task-1", 1, 1)

    const review = await beginReviewRound(store, "task:task-1", 1)
    const state = await store.readOpenCodeState()

    expect(review.status).toBe("escalated")
    expect(state.reviews["task:task-1"]?.status).toBe("escalated")
  })

  it("clears stale verdict and review job id when starting a new active round", async () => {
    const store = await createStore()
    await persistExistingReview(store, "task:task-1", 1, 3, "changes-requested", "FAIL", "old-review-session")

    const review = await beginReviewRound(store, "task:task-1", 3)
    const state = await store.readOpenCodeState()

    expect(review.status).toBe("reviewing")
    expect(review.lastVerdict).toBeUndefined()
    expect(review.lastReviewJobId).toBeUndefined()
    expect(state.reviews["task:task-1"]?.lastVerdict).toBeUndefined()
    expect(state.reviews["task:task-1"]?.lastReviewJobId).toBeUndefined()
  })

  it("does not downgrade an escalated review when persisting a verdict", async () => {
    const store = await createStore()
    await persistExistingReview(store, "proposal:proposal-1", 2, 1, "escalated")

    await persistReviewVerdict(store, "proposal:proposal-1", "PASS")
    const state = await store.readOpenCodeState()

    expect(state.reviews["proposal:proposal-1"]?.status).toBe("escalated")
    expect(state.reviews["proposal:proposal-1"]?.lastVerdict).toBeUndefined()
  })

  it("does not persist a verdict when the expected review job id differs", async () => {
    const store = await createStore()
    await persistExistingReview(store, "task:task-1", 1, 3, "reviewing", undefined, "current-job")

    const persisted = await persistReviewVerdict(store, "task:task-1", "PASS", { expectedReviewJobId: "old-job" })
    const state = await store.readOpenCodeState()

    expect(persisted).toBe(false)
    expect(state.reviews["task:task-1"]?.status).toBe("reviewing")
    expect(state.reviews["task:task-1"]?.lastVerdict).toBeUndefined()
    expect(state.reviews["task:task-1"]?.lastReviewJobId).toBe("current-job")
  })

  it("persists a verdict when the expected review job id matches", async () => {
    const store = await createStore()
    await persistExistingReview(store, "task:task-1", 1, 3, "reviewing", undefined, "current-job")

    const persisted = await persistReviewVerdict(store, "task:task-1", "FAIL", { expectedReviewJobId: "current-job" })
    const state = await store.readOpenCodeState()

    expect(persisted).toBe(true)
    expect(state.reviews["task:task-1"]?.status).toBe("changes-requested")
    expect(state.reviews["task:task-1"]?.lastVerdict).toBe("FAIL")
    expect(state.reviews["task:task-1"]?.lastReviewJobId).toBe("current-job")
  })

  it("persists a review job id when the expected round matches an active review", async () => {
    const store = await createStore()
    await persistExistingReview(store, "task:task-1", 2, 3, "reviewing", undefined, "previous-job")

    const persisted = await persistReviewJobId(store, "task:task-1", "current-job", { expectedRound: 2 })
    const state = await store.readOpenCodeState()

    expect(persisted).toBe(true)
    expect(state.reviews["task:task-1"]?.lastReviewJobId).toBe("current-job")
  })

  it("does not overwrite a review job id when the expected round differs", async () => {
    const store = await createStore()
    await persistExistingReview(store, "task:task-1", 3, 3, "reviewing", undefined, "current-job")

    const persisted = await persistReviewJobId(store, "task:task-1", "old-job", { expectedRound: 2 })
    const state = await store.readOpenCodeState()

    expect(persisted).toBe(false)
    expect(state.reviews["task:task-1"]?.lastReviewJobId).toBe("current-job")
  })

  it("does not persist a review job id to a completed review even when the round matches", async () => {
    const store = await createStore()
    await persistExistingReview(store, "task:task-1", 2, 3, "approved", "PASS", "current-job")

    const persisted = await persistReviewJobId(store, "task:task-1", "old-job", { expectedRound: 2 })
    const state = await store.readOpenCodeState()

    expect(persisted).toBe(false)
    expect(state.reviews["task:task-1"]?.lastReviewJobId).toBe("current-job")
    expect(state.reviews["task:task-1"]?.status).toBe("approved")
  })
})

async function createStore(): Promise<StateStore> {
  const projectRoot = await mkdtemp(join(tmpdir(), "chorus-review-sync-"))
  const store = new StateStore(projectRoot, ".chorus")
  await store.init()
  return store
}

async function persistExistingReview(
  store: StateStore,
  targetKey: string,
  currentRound: number,
  maxRounds: number,
  status: "reviewing" | "changes-requested" | "approved" | "escalated" = "reviewing",
  lastVerdict?: "PASS" | "PASS_WITH_NOTES" | "FAIL",
  lastReviewJobId?: string,
) {
  await store.updateOpenCodeState((state) => ({
    ...state,
    reviews: {
      ...state.reviews,
      [targetKey]: {
        currentRound,
        maxRounds,
        status,
        lastVerdict,
        lastReviewJobId,
        blockersSnapshot: [],
      },
    },
  }))
}
