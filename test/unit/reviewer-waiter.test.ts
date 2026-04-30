import { describe, expect, it } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { waitForReviewerVerdict } from "../../src/reviewers/reviewer-waiter"
import { StateStore } from "../../src/state/state-store"

describe("waitForReviewerVerdict", () => {
  it("returns a persisted verdict from state", async () => {
    const store = await createStore()
    await persistReview(store, "proposal:proposal-1", "PASS")
    const client = new FakeMcpClient([])

    const result = await waitForReviewerVerdict({
      client,
      stateStore: store,
      targetKey: "proposal:proposal-1",
      targetType: "proposal",
      targetUuid: "proposal-1",
      timeoutMs: 20,
      pollIntervalMs: 1,
    })

    expect(result).toEqual({ status: "completed", verdict: "PASS" })
    expect(client.calls).toEqual([])
  })

  it("ignores a persisted verdict while the review is still in progress", async () => {
    const store = await createStore()
    await persistReview(store, "proposal:proposal-stale", "PASS", "reviewing")
    const client = new FakeMcpClient([{ comments: [] }])

    const result = await waitForReviewerVerdict({
      client,
      stateStore: store,
      targetKey: "proposal:proposal-stale",
      targetType: "proposal",
      targetUuid: "proposal-stale",
      timeoutMs: 1,
      pollIntervalMs: 1,
    })

    expect(result).toEqual({ status: "timeout" })
  })

  it("times out when fetching Chorus comments hangs", async () => {
    const store = await createStore()
    const client = new HangingMcpClient()

    const result = await waitForReviewerVerdict({
      client,
      stateStore: store,
      targetKey: "task:task-hangs",
      targetType: "task",
      targetUuid: "task-hangs",
      timeoutMs: 5,
      pollIntervalMs: 1,
    })

    expect(result).toEqual({ status: "timeout" })
  })

  it("persists timeout recovery details in review state", async () => {
    const store = await createStore()
    await persistReview(store, "task:task-timeout", undefined, "reviewing", "review-timeout-job")
    const client = new FakeMcpClient([{ comments: [] }])

    const result = await waitForReviewerVerdict({
      client,
      stateStore: store,
      targetKey: "task:task-timeout",
      targetType: "task",
      targetUuid: "task-timeout",
      timeoutMs: 1,
      pollIntervalMs: 1,
      reviewJobId: "review-timeout-job",
    })
    const state = await store.readOpenCodeState()

    expect(result).toEqual({ status: "timeout" })
    expect(state.reviews["task:task-timeout"]).toMatchObject({
      status: "timed-out",
      lastReviewJobId: "review-timeout-job",
      lastGateStatus: "timeout",
      lastGateMessage: "Reviewer did not finish before timeout",
    })
  })

  it("returns and persists a verdict found in Chorus comments", async () => {
    const store = await createStore()
    const client = new FakeMcpClient([{ comments: [{ content: "Looks good\nVERDICT: PASS WITH NOTES" }] }])

    const result = await waitForReviewerVerdict({
      client,
      stateStore: store,
      targetKey: "task:task-1",
      targetType: "task",
      targetUuid: "task-1",
      timeoutMs: 20,
      pollIntervalMs: 1,
    })
    const state = await store.readOpenCodeState()

    expect(result).toEqual({ status: "completed", verdict: "PASS_WITH_NOTES" })
    expect(state.reviews["task:task-1"]?.lastVerdict).toBe("PASS_WITH_NOTES")
    expect(client.calls).toEqual([
      { name: "chorus_get_comments", args: { targetType: "task", targetUuid: "task-1" } },
    ])
  })

  it("uses only comments marked with the current review job id", async () => {
    const store = await createStore()
    await persistReview(store, "task:task-current", undefined, "reviewing", "review-session-2")
    const client = new FakeMcpClient([
      {
        comments: [
          { content: "Old review\nVERDICT: PASS" },
          { content: "Current review\nReview-Job-ID: review-session-2\nVERDICT: FAIL" },
        ],
      },
    ])

    const result = await waitForReviewerVerdict({
      client,
      stateStore: store,
      targetKey: "task:task-current",
      targetType: "task",
      targetUuid: "task-current",
      timeoutMs: 20,
      pollIntervalMs: 1,
      reviewJobId: "review-session-2",
    })

    expect(result).toEqual({ status: "completed", verdict: "FAIL" })
  })

  it("times out when only unmarked old verdicts exist for a current review job", async () => {
    const store = await createStore()
    const client = new FakeMcpClient([{ comments: [{ content: "Old review\nVERDICT: PASS" }] }])

    const result = await waitForReviewerVerdict({
      client,
      stateStore: store,
      targetKey: "proposal:proposal-current",
      targetType: "proposal",
      targetUuid: "proposal-current",
      timeoutMs: 1,
      pollIntervalMs: 1,
      reviewJobId: "review-session-current",
    })

    expect(result).toEqual({ status: "timeout" })
  })

  it("requires the current review job marker to be an exact line", async () => {
    const store = await createStore()
    await persistReview(store, "task:task-exact-marker", undefined, "reviewing", "review-session-current")
    const client = new FakeMcpClient([
      {
        comments: [
          { content: "Previous marker: Review-Job-ID: review-session-current\nVERDICT: PASS" },
          { content: "Review-Job-ID: review-session-current suffix\nVERDICT: PASS" },
          { content: "Review-Job-ID: review-session-current\nVERDICT: FAIL" },
        ],
      },
    ])

    const result = await waitForReviewerVerdict({
      client,
      stateStore: store,
      targetKey: "task:task-exact-marker",
      targetType: "task",
      targetUuid: "task-exact-marker",
      timeoutMs: 20,
      pollIntervalMs: 1,
      reviewJobId: "review-session-current",
    })

    expect(result).toEqual({ status: "completed", verdict: "FAIL" })
  })

  it("does not complete when a marked old comment no longer matches the current review job", async () => {
    const store = await createStore()
    await persistReview(store, "task:task-race", undefined, "reviewing", "new-job")
    const client = new FakeMcpClient([
      { comments: [{ content: "Review-Job-ID: old-job\nVERDICT: PASS" }] },
    ])

    const result = await waitForReviewerVerdict({
      client,
      stateStore: store,
      targetKey: "task:task-race",
      targetType: "task",
      targetUuid: "task-race",
      timeoutMs: 1,
      pollIntervalMs: 1,
      reviewJobId: "old-job",
    })
    const state = await store.readOpenCodeState()

    expect(result).toEqual({ status: "timeout" })
    expect(state.reviews["task:task-race"]?.status).toBe("reviewing")
    expect(state.reviews["task:task-race"]?.lastVerdict).toBeUndefined()
    expect(state.reviews["task:task-race"]?.lastReviewJobId).toBe("new-job")
  })

  it("times out when no verdict appears", async () => {
    const store = await createStore()
    const client = new FakeMcpClient([{ comments: [] }, { comments: [{ content: "Still reviewing" }] }])

    const result = await waitForReviewerVerdict({
      client,
      stateStore: store,
      targetKey: "proposal:proposal-2",
      targetType: "proposal",
      targetUuid: "proposal-2",
      timeoutMs: 1,
      pollIntervalMs: 1,
    })

    expect(result).toEqual({ status: "timeout" })
  })

  it("ignores invalid comments while still finding a later valid verdict", async () => {
    const store = await createStore()
    const client = new FakeMcpClient([
      [
        { content: "This has no verdict" },
        { content: "VERDICT: MAYBE" },
      ],
      [{ content: "Changes are needed\nVERDICT: FAIL" }],
    ])

    const result = await waitForReviewerVerdict({
      client,
      stateStore: store,
      targetKey: "task:task-2",
      targetType: "task",
      targetUuid: "task-2",
      timeoutMs: 20,
      pollIntervalMs: 1,
    })

    expect(result).toEqual({ status: "completed", verdict: "FAIL" })
  })
})

class FakeMcpClient {
  readonly calls: Array<{ name: string; args: Record<string, unknown> }> = []
  private nextResponse = 0

  constructor(private readonly responses: unknown[]) {}

  async callTool<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    this.calls.push({ name, args })
    const response = this.responses[Math.min(this.nextResponse, this.responses.length - 1)]
    this.nextResponse += 1
    return response as T
  }
}

class HangingMcpClient {
  async callTool<T>(): Promise<T> {
    return new Promise<T>(() => {})
  }
}

async function createStore(): Promise<StateStore> {
  const projectRoot = await mkdtemp(join(tmpdir(), "chorus-reviewer-waiter-"))
  const store = new StateStore(projectRoot, ".chorus")
  await store.init()
  return store
}

async function persistReview(
  store: StateStore,
  targetKey: string,
  lastVerdict?: "PASS" | "PASS_WITH_NOTES" | "FAIL",
  status: "reviewing" | "changes-requested" | "approved" = "approved",
  lastReviewJobId?: string,
) {
  await store.updateOpenCodeState((state) => ({
    ...state,
    reviews: {
      ...state.reviews,
      [targetKey]: {
        currentRound: 1,
        maxRounds: 1,
        status,
        lastVerdict,
        lastReviewJobId,
        blockersSnapshot: [],
      },
    },
  }))
}
