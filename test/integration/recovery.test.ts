import { describe, expect, it } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { markInterruptedReviews } from "../../src/lifecycle/reviewer-lifecycle"
import { cleanupOrphanWorkers } from "../../src/lifecycle/worker-lifecycle"
import { createDefaultOpenCodeState } from "../../src/state/migrations"
import { StateStore } from "../../src/state/state-store"

describe("recovery", () => {
  it("starts from a valid default state shape", () => {
    const state = createDefaultOpenCodeState()
    expect(state.mainSession.status).toBe("idle")
    expect(state.notificationQueue).toEqual([])
  })

  it("aborts running workers during recovery cleanup", async () => {
    const stateStore = await createTestStateStore()
    await stateStore.updateOpenCodeState((state) => ({
      ...state,
      workers: {
        active: {
          kind: "worker",
          status: "running",
          runtimeSessionId: "worker-session",
          startedAt: "2026-01-01T00:00:00.000Z",
        },
        done: {
          kind: "worker",
          status: "completed",
          runtimeSessionId: "done-session",
          startedAt: "2026-01-01T00:00:00.000Z",
          finishedAt: "2026-01-01T00:01:00.000Z",
        },
      },
    }))

    await cleanupOrphanWorkers(stateStore)

    const state = await stateStore.readOpenCodeState()
    const activeWorker = state.workers.active
    const completedWorker = state.workers.done
    if (!activeWorker || !completedWorker) throw new Error("Expected recovery workers to exist")
    expect(activeWorker.status).toBe("aborted")
    expect(activeWorker.finishedAt).toBeDefined()
    expect(completedWorker.status).toBe("completed")
  })

  it("marks in-progress reviews as interrupted during recovery", async () => {
    const stateStore = await createTestStateStore()
    await stateStore.updateOpenCodeState((state) => ({
      ...state,
      reviews: {
        current: {
          currentRound: 1,
          maxRounds: 2,
          status: "reviewing",
          blockersSnapshot: [],
        },
        approved: {
          currentRound: 1,
          maxRounds: 2,
          status: "approved",
          blockersSnapshot: [],
        },
      },
    }))

    await markInterruptedReviews(stateStore)

    const state = await stateStore.readOpenCodeState()
    const currentReview = state.reviews.current
    const approvedReview = state.reviews.approved
    if (!currentReview || !approvedReview) throw new Error("Expected recovery reviews to exist")
    expect(currentReview.status).toBe("interrupted")
    expect(currentReview.lastGateStatus).toBe("interrupted")
    expect(currentReview.lastGateMessage).toBe("Reviewer session was interrupted before posting a verdict")
    expect(approvedReview.status).toBe("approved")
  })
})

async function createTestStateStore(): Promise<StateStore> {
  const projectRoot = await mkdtemp(join(tmpdir(), "chorus-recovery-"))
  const stateStore = new StateStore(projectRoot, ".chorus")
  await stateStore.init()
  return stateStore
}
