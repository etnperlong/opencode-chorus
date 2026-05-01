import { describe, expect, it } from "bun:test"
import { createChorusLazyBridge, createChorusLazyBridgeTools } from "../../src/tools/lazy-bridge-tools"

describe("Chorus lazy bridge tools", () => {
  it("explores Chorus tools from the dynamic MCP tool list", async () => {
    const tools = createChorusLazyBridgeTools({
      chorusClient: createClient(),
    })

    const result = await tools.chorus_tool_explore!.execute({ query: "update task", limit: 5 }, createToolContext())

    expect(readOutput(result)).toContain("chorus_update_task")
    expect(readOutput(result)).toContain("Update a task")
  })

  it("records lightweight lazy bridge status without persisting schemas", async () => {
    const stateUpdates: unknown[] = []
    const tools = createChorusLazyBridgeTools({
      chorusClient: createClient(),
      stateStore: {
        updateOpenCodeState: async (updater: (state: Record<string, unknown>) => Record<string, unknown>) => {
          const next = updater({})
          stateUpdates.push(next)
          return next
        },
      },
      chorusUrl: "http://localhost:8637",
    })

    await tools.chorus_tool_explore!.execute({ query: "task", limit: 5 }, createToolContext())

    expect(stateUpdates.at(-1)).toEqual({
      lazyBridge: expect.objectContaining({
        status: "connected",
        toolCount: 3,
        chorusUrl: "http://localhost:8637",
      }),
    })
    expect(JSON.stringify(stateUpdates.at(-1))).not.toContain("inputSchema")
  })

  it("clears stale failure details after a successful lazy bridge refresh", async () => {
    let currentState: Record<string, unknown> = {
      lazyBridge: {
        status: "error",
        lastError: "previous failure",
        lastRefreshFailedAt: "2026-01-01T00:00:00.000Z",
      },
    }
    const bridge = createChorusLazyBridge({
      chorusClient: createClient(),
      stateStore: {
        updateOpenCodeState: async (updater: (state: Record<string, unknown>) => Record<string, unknown>) => {
          currentState = updater(currentState)
          return currentState
        },
      },
    })

    await bridge.refresh()

    expect(currentState.lazyBridge).toEqual(
      expect.objectContaining({
        status: "connected",
        toolCount: 3,
      }),
    )
    expect(JSON.stringify(currentState.lazyBridge)).not.toContain("previous failure")
    expect(JSON.stringify(currentState.lazyBridge)).not.toContain("lastRefreshFailedAt")
  })

  it("shows a success toast when the lazy bridge tool index refreshes", async () => {
    const toasts: Array<{ title?: string; message?: string; variant?: string }> = []
    const bridge = createChorusLazyBridge({
      chorusClient: createClient(),
      tui: {
        showToast: async (input: { title?: string; message?: string; variant?: string }) => {
          toasts.push(input)
        },
      },
    })

    await bridge.refresh()

    expect(toasts).toContainEqual(
      expect.objectContaining({
        title: "Chorus tools connected",
        message: "3 tools available",
        variant: "success",
      }),
    )
  })

  it("shows an error toast without leaking secrets when the lazy bridge cannot refresh", async () => {
    const toasts: Array<{ title?: string; message?: string; variant?: string }> = []
    const bridge = createChorusLazyBridge({
      chorusClient: {
        async listTools() {
          throw new Error("request failed with api-key-secret")
        },
        async callTool<T>() {
          return {} as T
        },
      },
      tui: {
        showToast: async (input: { title?: string; message?: string; variant?: string }) => {
          toasts.push(input)
        },
      },
    })

    await expect(bridge.refresh()).rejects.toThrow("api-key-secret")

    expect(toasts).toContainEqual(
      expect.objectContaining({
        title: "Chorus tools unavailable",
        variant: "error",
      }),
    )
    expect(JSON.stringify(toasts)).not.toContain("api-key-secret")
  })

  it("executes a real Chorus tool through the bridge", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    const tools = createChorusLazyBridgeTools({
      chorusClient: createClient(calls),
    })

    const result = await tools.chorus_tool_execute!.execute(
      {
        toolName: "chorus_get_task",
        arguments: { taskUuid: "task-1" },
      },
      createToolContext(),
    )

    expect(calls).toEqual([{ name: "chorus_get_task", args: { taskUuid: "task-1" } }])
    expect(readOutput(result)).toContain("task-1")
  })

  it("executes real Chorus tools with project scope from shared state", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown>; scope?: Record<string, unknown> }> = []
    const tools = createChorusLazyBridgeTools({
      chorusClient: {
        async listTools() {
          return createToolDefinitions()
        },
        async callTool<T>(name: string, args: Record<string, unknown>, scope?: Record<string, unknown>): Promise<T> {
          calls.push({ name, args, scope })
          return { ok: true } as T
        },
      },
      stateStore: {
        async updateOpenCodeState(updater: (state: Record<string, unknown>) => Record<string, unknown>) {
          return updater({})
        },
        async readSharedState() {
          return {
            version: 1,
            context: { projectUuid: "project-1" },
            orphanHints: [],
          }
        },
      },
    })

    await tools.chorus_tool_execute!.execute(
      {
        toolName: "chorus_get_task",
        arguments: { taskUuid: "task-1" },
      },
      createToolContext(),
    )

    expect(calls[0]).toEqual({
      name: "chorus_get_task",
      args: { taskUuid: "task-1" },
      scope: { projectUuid: "project-1" },
    })
  })

  it("removes accidental empty title and description from chorus_update_task", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    const tools = createChorusLazyBridgeTools({
      chorusClient: createClient(calls),
    })

    await tools.chorus_tool_execute!.execute(
      {
        toolName: "chorus_update_task",
        arguments: {
          taskUuid: "task-1",
          status: "in_progress",
          title: "",
          description: "",
        },
      },
      createToolContext(),
    )

    expect(calls[0]).toEqual({
      name: "chorus_update_task",
      args: { taskUuid: "task-1", status: "in_progress" },
    })
  })

  it("does not globally remove other optional empty strings", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    const tools = createChorusLazyBridgeTools({
      chorusClient: createClient(calls),
    })

    await tools.chorus_tool_execute!.execute(
      {
        toolName: "chorus_add_comment",
        arguments: {
          targetType: "task",
          targetUuid: "task-1",
          content: "",
        },
      },
      createToolContext(),
    )

    expect(calls[0]).toEqual({
      name: "chorus_add_comment",
      args: { targetType: "task", targetUuid: "task-1", content: "" },
    })
  })
})

function createClient(calls: Array<{ name: string; args: Record<string, unknown> }> = []) {
  return {
    async listTools() {
      return createToolDefinitions()
    },
    async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
      calls.push({ name, args })
      return { ok: true, taskUuid: args.taskUuid } as T
    },
  }
}

function createToolDefinitions() {
  return [
    {
      name: "chorus_update_task",
      description: "Update a task",
      inputSchema: {
        type: "object",
        required: ["taskUuid"],
        properties: {
          taskUuid: { type: "string" },
          status: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
        },
      },
    },
    {
      name: "chorus_get_task",
      description: "Get a task",
      inputSchema: { type: "object", required: ["taskUuid"], properties: { taskUuid: { type: "string" } } },
    },
    {
      name: "chorus_add_comment",
      description: "Add a comment",
      inputSchema: { type: "object", properties: { content: { type: "string" } } },
    },
  ]
}

function createToolContext() {
  return {
    sessionID: "session-1",
    messageID: "message-1",
    agent: "build",
    directory: "/tmp/project",
    worktree: "/tmp/project",
    abort: new AbortController().signal,
    metadata: () => {},
    ask: (() => {}) as never,
  }
}

function readOutput(result: string | { output: string }): string {
  return typeof result === "string" ? result : result.output
}
