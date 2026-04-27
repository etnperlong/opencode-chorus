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
})
