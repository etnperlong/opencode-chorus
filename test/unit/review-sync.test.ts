import { describe, expect, it } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beginReviewRound, persistReviewVerdict } from "../../src/reviewers/review-sync"
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

  it("does not downgrade an escalated review when persisting a verdict", async () => {
    const store = await createStore()
    await persistExistingReview(store, "proposal:proposal-1", 2, 1, "escalated")

    await persistReviewVerdict(store, "proposal:proposal-1", "PASS")
    const state = await store.readOpenCodeState()

    expect(state.reviews["proposal:proposal-1"]?.status).toBe("escalated")
    expect(state.reviews["proposal:proposal-1"]?.lastVerdict).toBeUndefined()
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
  status: "reviewing" | "escalated" = "reviewing",
) {
  await store.updateOpenCodeState((state) => ({
    ...state,
    reviews: {
      ...state.reviews,
      [targetKey]: {
        currentRound,
        maxRounds,
        status,
        blockersSnapshot: [],
      },
    },
  }))
}
