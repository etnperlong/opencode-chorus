import { describe, expect, it } from "bun:test"
import { createToolExecuteAfterHook } from "../../src/hooks/tool-execute-after-hook"

describe("tool.execute.after hook", () => {
  it("updates planning scope for planning tools", async () => {
    const ensureScopeCalls: string[] = []
    const markTodoCalls: Array<{ sessionId: string; patch: Record<string, unknown> }> = []

    const hook = createToolExecuteAfterHook({
      config: {
        enableProposalReviewer: false,
        enableTaskReviewer: false,
        maxProposalReviewRounds: 3,
        maxTaskReviewRounds: 3,
        reviewerWaitTimeoutMs: 300000,
        reviewerPollIntervalMs: 1000,
        reviewGateOutputMode: "summary",
      },
      stateStore: {
        paths: { stateFile: ".chorus/opencode-state.json" },
        readOpenCodeState: async () => ({
          mainSession: { runtimeSessionId: "main-session" },
          reviews: {},
        }),
      } as never,
      planningLifecycle: {
        ensureScope: async (sessionId: string) => {
          ensureScopeCalls.push(sessionId)
        },
        markTodo: async (sessionId: string, patch: Record<string, unknown>) => {
          markTodoCalls.push({ sessionId, patch })
        },
      } as never,
      context: {
        client: {} as never,
        directory: "/tmp/project",
      },
      chorusClient: {
        callTool: async <T>() => ({} as T),
      } as never,
    })

    await hook(
      {
        tool: "chorus_create_proposal",
        args: {},
        sessionID: "tool-session-1",
      },
      { title: "", output: "{}", metadata: {} },
    )

    expect(ensureScopeCalls).toEqual(["tool-session-1"])
    expect(markTodoCalls).toEqual([
      {
        sessionId: "tool-session-1",
        patch: { proposalExists: true },
      },
    ])
  })

  it("updates planning scope for tools executed through the lazy bridge", async () => {
    const ensureScopeCalls: string[] = []
    const markTodoCalls: Array<{ sessionId: string; patch: Record<string, unknown> }> = []

    const hook = createToolExecuteAfterHook({
      config: {
        enableProposalReviewer: false,
        enableTaskReviewer: false,
        maxProposalReviewRounds: 3,
        maxTaskReviewRounds: 3,
        reviewerWaitTimeoutMs: 300000,
        reviewerPollIntervalMs: 1000,
        reviewGateOutputMode: "summary",
      },
      stateStore: {
        paths: { stateFile: ".chorus/opencode-state.json" },
        readOpenCodeState: async () => ({
          mainSession: { runtimeSessionId: "main-session" },
          reviews: {},
        }),
      } as never,
      planningLifecycle: {
        ensureScope: async (sessionId: string) => {
          ensureScopeCalls.push(sessionId)
        },
        markTodo: async (sessionId: string, patch: Record<string, unknown>) => {
          markTodoCalls.push({ sessionId, patch })
        },
      } as never,
      context: {
        client: {} as never,
        directory: "/tmp/project",
      },
      chorusClient: {
        callTool: async <T>() => ({} as T),
      } as never,
    })

    await hook(
      {
        tool: "chorus_tool_execute",
        args: { toolName: "chorus_pm_create_proposal", arguments: {} },
        sessionID: "tool-session-1",
      },
      { title: "", output: "{}", metadata: {} },
    )

    expect(ensureScopeCalls).toEqual(["tool-session-1"])
    expect(markTodoCalls).toEqual([
      {
        sessionId: "tool-session-1",
        patch: { proposalExists: true },
      },
    ])
  })

  it("loads reviewer target snapshots with project scope from shared state", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown>; scope?: Record<string, unknown> }> = []
    const hook = createToolExecuteAfterHook({
      config: {
        enableProposalReviewer: true,
        enableTaskReviewer: false,
        maxProposalReviewRounds: 3,
        maxTaskReviewRounds: 3,
        reviewerWaitTimeoutMs: 1,
        reviewerPollIntervalMs: 1,
        reviewGateOutputMode: "summary",
      },
      stateStore: {
        paths: { stateFile: ".chorus/opencode-state.json" },
        readOpenCodeState: async () => ({
          mainSession: { runtimeSessionId: "main-session" },
          reviews: {},
        }),
        readSharedState: async () => ({
          context: { projectUuid: "project-1" },
        }),
      } as never,
      planningLifecycle: {
        ensureScope: async () => {},
        markTodo: async () => {},
      } as never,
      context: {
        client: {} as never,
        directory: "/tmp/project",
      },
      chorusClient: {
        callTool: async <T>(name: string, args: Record<string, unknown> = {}, scope?: Record<string, unknown>) => {
          calls.push({ name, args, scope })
          throw new Error("stop before reviewer dispatch")
        },
      } as never,
    })

    await hook(
      {
        tool: "chorus_tool_execute",
        args: { toolName: "chorus_pm_submit_proposal", arguments: { proposalUuid: "proposal-1" } },
        sessionID: "tool-session-1",
      },
      { title: "", output: "{}", metadata: {} },
    )

    expect(calls[0]).toEqual({
      name: "chorus_get_proposal",
      args: { proposalUuid: "proposal-1" },
      scope: { projectUuid: "project-1" },
    })
  })
})
