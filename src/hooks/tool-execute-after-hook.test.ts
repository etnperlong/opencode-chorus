import { describe, expect, it } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createToolExecuteAfterHook } from "./tool-execute-after-hook"
import type { PlanningLifecycle } from "../lifecycle/planning-lifecycle"
import { StateStore } from "../state/state-store"

describe("tool execute after hook", () => {
  it("persists the full reviewer comment from chorus_add_comment", async () => {
    const store = await createStore()
    await store.updateOpenCodeState((state) => ({
      ...state,
      reviews: {
        ...state.reviews,
        "proposal:proposal-1": {
          currentRound: 1,
          maxRounds: 3,
          status: "reviewing",
          lastReviewJobId: "review-session-1",
          blockersSnapshot: [],
        },
      },
    }))

    const hook = createToolExecuteAfterHook({
      config: {
        enableProposalReviewer: true,
        enableTaskReviewer: true,
        maxProposalReviewRounds: 3,
        maxTaskReviewRounds: 3,
        reviewerWaitTimeoutMs: 1,
        reviewerPollIntervalMs: 1,
        reviewGateOutputMode: "summary",
      },
      stateStore: store,
      planningLifecycle: {
        ensureScope: async () => {},
        markTodo: async () => {},
      } as unknown as PlanningLifecycle,
      context: {
        client: {} as never,
        directory: "/tmp",
      },
      chorusClient: {
        callTool: async () => ({}),
      } as never,
    })

    await hook(
      {
        tool: "chorus_add_comment",
        args: {
          targetType: "proposal",
          targetUuid: "proposal-1",
          content: "Review-Job-ID: review-session-1\nVERDICT: FAIL\n\nBLOCKER: reviewer comment should be preserved",
        },
        sessionID: "review-session-1",
      },
      {
        title: "comment",
        output: "{}",
        metadata: {},
      },
    )

    const state = await store.readOpenCodeState()
    expect(state.reviews["proposal:proposal-1"]?.lastReviewerComment).toContain("BLOCKER: reviewer comment should be preserved")
  })

  it("does not dispatch a second reviewer while an unchanged review is already running", async () => {
    const store = await createStore()
    await store.updateOpenCodeState((state) => ({
      ...state,
      reviews: {
        ...state.reviews,
        "proposal:proposal-1": {
          currentRound: 1,
          maxRounds: 3,
          status: "reviewing",
          lastReviewJobId: "review-session-1",
          lastTargetSignature: "sig-1",
          blockersSnapshot: [],
        },
      },
    }))
    const dispatchClient = createDispatchClient()

    const hook = createToolExecuteAfterHook({
      config: {
        enableProposalReviewer: true,
        enableTaskReviewer: true,
        maxProposalReviewRounds: 3,
        maxTaskReviewRounds: 3,
        reviewerWaitTimeoutMs: 1,
        reviewerPollIntervalMs: 1,
        reviewGateOutputMode: "summary",
      },
      stateStore: store,
      planningLifecycle: {
        ensureScope: async () => {},
        markTodo: async () => {},
      } as unknown as PlanningLifecycle,
      context: {
        client: dispatchClient as never,
        directory: "/tmp",
      },
      chorusClient: {
        callTool: async () => ({ uuid: "proposal-1", title: "Same proposal" }),
      } as never,
    })

    await hook(
      {
        tool: "chorus_pm_submit_proposal",
        args: { proposalUuid: "proposal-1" },
        sessionID: "main-session-1",
      },
      {
        title: "proposal submit",
        output: JSON.stringify({ proposalUuid: "proposal-1" }),
        metadata: {},
      },
    )

    expect(dispatchClient.createCalls).toBe(0)
    expect(dispatchClient.promptCalls).toBe(0)
  })

  it("does not consume a new review round when target signature lookup fails", async () => {
    const store = await createStore()
    const dispatchClient = createDispatchClient()

    const hook = createToolExecuteAfterHook({
      config: {
        enableProposalReviewer: true,
        enableTaskReviewer: true,
        maxProposalReviewRounds: 3,
        maxTaskReviewRounds: 3,
        reviewerWaitTimeoutMs: 1,
        reviewerPollIntervalMs: 1,
        reviewGateOutputMode: "summary",
      },
      stateStore: store,
      planningLifecycle: {
        ensureScope: async () => {},
        markTodo: async () => {},
      } as unknown as PlanningLifecycle,
      context: {
        client: dispatchClient as never,
        directory: "/tmp",
      },
      chorusClient: {
        callTool: async () => {
          throw new Error("read failed")
        },
      } as never,
    })

    const output = {
      title: "proposal submit",
      output: JSON.stringify({ proposalUuid: "proposal-1" }),
      metadata: {},
    }

    await hook(
      {
        tool: "chorus_pm_submit_proposal",
        args: { proposalUuid: "proposal-1" },
        sessionID: "main-session-1",
      },
      output,
    )

    const state = await store.readOpenCodeState()
    expect(dispatchClient.createCalls).toBe(0)
    expect(state.reviews["proposal:proposal-1"]).toBeUndefined()
    expect(output.output).toContain("Reviewer could not load the current target snapshot")
  })
})

async function createStore(): Promise<StateStore> {
  const projectRoot = await mkdtemp(join(tmpdir(), "chorus-tool-after-hook-"))
  const store = new StateStore(projectRoot, ".chorus")
  await store.init()
  return store
}

function createDispatchClient() {
  const client = {
    createCalls: 0,
    promptCalls: 0,
    session: {
      create: async () => {
        client.createCalls += 1
        return { data: { id: "review-session-new" } }
      },
      promptAsync: async () => {
        client.promptCalls += 1
      },
    },
  }

  return {
    ...client,
  }
}
