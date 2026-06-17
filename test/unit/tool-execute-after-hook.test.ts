import { describe, expect, it } from "bun:test"
import { createToolExecuteAfterHook } from "../../src/hooks/tool-execute-after-hook"

describe("tool.execute.after hook", () => {
  function createReportReminderHook(
    callTool: (name: string, args?: Record<string, unknown>, scope?: Record<string, unknown>) => Promise<unknown>,
  ) {
    return createToolExecuteAfterHook({
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
        readSharedState: async () => ({
          context: { projectUuid: "scope-project" },
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
        callTool: callTool as never,
      } as never,
    })
  }

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
      args: { proposalUuid: "proposal-1", section: "full" },
      scope: { projectUuid: "project-1" },
    })
  })

  it("appends an idea-completion report reminder after verifying the final idea task", async () => {
    const calls: Array<{ name: string; args?: Record<string, unknown>; scope?: Record<string, unknown> }> = []
    const hook = createReportReminderHook(async (name, args = {}, scope) => {
      calls.push({ name, args, scope })
      if (name === "chorus_get_task") {
        return { proposalUuid: "proposal-1", project: { uuid: "project-1" } }
      }
      if (name === "chorus_get_proposal") {
        return { inputType: "idea" }
      }
      if (name === "chorus_list_tasks") {
        return { total: 2, tasks: [{ status: "done" }, { status: "closed" }] }
      }
      if (name === "chorus_get_documents") {
        return { total: 0, documents: [] }
      }
      return {}
    })

    const output = { title: "", output: JSON.stringify({ verified: true }), metadata: {} }

    await hook(
      {
        tool: "chorus_admin_verify_task",
        args: { taskUuid: "task-1" },
        sessionID: "tool-session-1",
      },
      output,
    )

    expect(calls).toEqual([
      { name: "chorus_get_task", args: { taskUuid: "task-1" }, scope: { projectUuid: "scope-project" } },
      { name: "chorus_get_proposal", args: { proposalUuid: "proposal-1" }, scope: { projectUuid: "scope-project" } },
      {
        name: "chorus_list_tasks",
        args: { projectUuid: "project-1", proposalUuids: ["proposal-1"], pageSize: 200 },
        scope: { projectUuid: "scope-project" },
      },
      {
        name: "chorus_get_documents",
        args: { projectUuid: "project-1", type: "report", pageSize: 200 },
        scope: { projectUuid: "scope-project" },
      },
    ])

    expect(JSON.parse(output.output)).toEqual({
      verified: true,
      ideaCompletionReportReminder: {
        toolName: "chorus_create_report",
        proposalUuid: "proposal-1",
        nextAction:
          "Call chorus_create_report for proposal proposal-1. Follow the tool description for the Summary / Decisions / Follow-ups template.",
      },
    })
  })

  it("skips the report reminder when the proposal still has unfinished tasks", async () => {
    const hook = createReportReminderHook(async (name) => {
      if (name === "chorus_get_task") {
        return { proposalUuid: "proposal-1", project: { uuid: "project-1" } }
      }
      if (name === "chorus_get_proposal") {
        return { inputType: "idea" }
      }
      if (name === "chorus_list_tasks") {
        return { total: 2, tasks: [{ status: "done" }, { status: "in_progress" }] }
      }
      if (name === "chorus_get_documents") {
        return { total: 0, documents: [] }
      }
      return {}
    })

    const output = { title: "", output: JSON.stringify({ verified: true }), metadata: {} }

    await hook(
      {
        tool: "chorus_admin_verify_task",
        args: { taskUuid: "task-1" },
        sessionID: "tool-session-1",
      },
      output,
    )

    expect(JSON.parse(output.output)).toEqual({ verified: true })
  })

  it("skips the report reminder when the proposal already has a report document", async () => {
    const hook = createReportReminderHook(async (name) => {
      if (name === "chorus_get_task") {
        return { proposalUuid: "proposal-1", project: { uuid: "project-1" } }
      }
      if (name === "chorus_get_proposal") {
        return { inputType: "idea" }
      }
      if (name === "chorus_list_tasks") {
        return { total: 1, tasks: [{ status: "done" }] }
      }
      if (name === "chorus_get_documents") {
        return { total: 1, documents: [{ proposalUuid: "proposal-1" }] }
      }
      return {}
    })

    const output = { title: "", output: JSON.stringify({ verified: true }), metadata: {} }

    await hook(
      {
        tool: "chorus_admin_verify_task",
        args: { taskUuid: "task-1" },
        sessionID: "tool-session-1",
      },
      output,
    )

    expect(JSON.parse(output.output)).toEqual({ verified: true })
  })

  it("skips the report reminder for non-idea proposals", async () => {
    const calls: string[] = []
    const hook = createReportReminderHook(async (name) => {
      calls.push(name)
      if (name === "chorus_get_task") {
        return { proposalUuid: "proposal-1", project: { uuid: "project-1" } }
      }
      if (name === "chorus_get_proposal") {
        return { inputType: "task" }
      }
      return {}
    })

    const output = { title: "", output: JSON.stringify({ verified: true }), metadata: {} }

    await hook(
      {
        tool: "chorus_admin_verify_task",
        args: { taskUuid: "task-1" },
        sessionID: "tool-session-1",
      },
      output,
    )

    expect(calls).toEqual(["chorus_get_task", "chorus_get_proposal"])
    expect(JSON.parse(output.output)).toEqual({ verified: true })
  })

  it("skips the report reminder when a lookup fails", async () => {
    const hook = createReportReminderHook(async (name) => {
      if (name === "chorus_get_task") {
        return { proposalUuid: "proposal-1", project: { uuid: "project-1" } }
      }
      if (name === "chorus_get_proposal") {
        return { inputType: "idea" }
      }
      if (name === "chorus_list_tasks") {
        throw new Error("lookup failed")
      }
      return {}
    })

    const output = { title: "", output: JSON.stringify({ verified: true }), metadata: {} }

    await hook(
      {
        tool: "chorus_admin_verify_task",
        args: { taskUuid: "task-1" },
        sessionID: "tool-session-1",
      },
      output,
    )

    expect(JSON.parse(output.output)).toEqual({ verified: true })
  })

  it("skips the report reminder when pagination evidence is incomplete", async () => {
    const hook = createReportReminderHook(async (name) => {
      if (name === "chorus_get_task") {
        return { proposalUuid: "proposal-1", project: { uuid: "project-1" } }
      }
      if (name === "chorus_get_proposal") {
        return { inputType: "idea" }
      }
      if (name === "chorus_list_tasks") {
        return { total: 2, tasks: [{ status: "done" }] }
      }
      if (name === "chorus_get_documents") {
        return { total: 0, documents: [] }
      }
      return {}
    })

    const output = { title: "", output: JSON.stringify({ verified: true }), metadata: {} }

    await hook(
      {
        tool: "chorus_admin_verify_task",
        args: { taskUuid: "task-1" },
        sessionID: "tool-session-1",
      },
      output,
    )

    expect(JSON.parse(output.output)).toEqual({ verified: true })
  })
})
