import { describe, expect, it } from "bun:test"
import { mkdtemp, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createChorusLazyBridge, createChorusLazyBridgeTools, rewriteDocumentArgs } from "../../src/tools/lazy-bridge-tools"

describe("Chorus lazy bridge tools", () => {
  it("lists Chorus tools from the dynamic MCP tool list", async () => {
    const tools = createChorusLazyBridgeTools({
      chorusClient: createClient(),
    })

    const result = await tools.chorus_tools!.execute({}, createToolContext("chorus"))

    expect(readOutput(result)).toContain('"total": 3')
    expect(readOutput(result)).toContain('"name": "chorus_update_task"')
    expect(readOutput(result)).toContain("chorus_update_task")
    expect(readOutput(result)).toContain("Update a task")
  })

  it("rejects bridge tool calls from non-Chorus agents", async () => {
    const tools = createChorusLazyBridgeTools({
      chorusClient: createClient(),
    })

    await expect(tools.chorus_tools!.execute({}, createToolContext("build"))).rejects.toThrow(
      "Chorus bridge tools are only available to the chorus, proposal-reviewer, and task-reviewer agents. Current agent: build",
    )
    await expect(tools.chorus_tool_get!.execute({ toolName: "chorus_get_task" }, createToolContext("other-agent"))).rejects.toThrow(
      /only available to the chorus/,
    )
    await expect(tools.chorus_tool_execute!.execute({ toolName: "chorus_get_task" }, createToolContext("general"))).rejects.toThrow(
      /only available to the chorus/,
    )
  })

  it("allows chorus, proposal-reviewer, and task-reviewer agents to use bridge tools", async () => {
    const tools = createChorusLazyBridgeTools({ chorusClient: createClient() })

    await expect(tools.chorus_tools!.execute({}, createToolContext("chorus"))).resolves.toBeDefined()
    await expect(tools.chorus_tools!.execute({}, createToolContext("proposal-reviewer"))).resolves.toBeDefined()
    await expect(tools.chorus_tools!.execute({}, createToolContext("task-reviewer"))).resolves.toBeDefined()
  })

  it("triggers silent readiness for proposal-reviewer before bridge access", async () => {
    const readinessCalls: Array<{ sessionId: string; mode: string }> = []
    const tools = createChorusLazyBridgeTools({
      chorusClient: createClient(),
      readiness: {
        ensureReady: async (sessionId, mode) => {
          readinessCalls.push({ sessionId, mode })
        },
      },
    })

    await tools.chorus_tools!.execute({}, createToolContext("proposal-reviewer", "reviewer-session"))

    expect(readinessCalls).toEqual([{ sessionId: "reviewer-session", mode: "silent" }])
  })

  it("triggers silent readiness for task-reviewer before bridge access", async () => {
    const readinessCalls: Array<{ sessionId: string; mode: string }> = []
    const tools = createChorusLazyBridgeTools({
      chorusClient: createClient(),
      readiness: {
        ensureReady: async (sessionId, mode) => {
          readinessCalls.push({ sessionId, mode })
        },
      },
    })

    await tools.chorus_tool_execute!.execute(
      { toolName: "chorus_get_task", arguments: { taskUuid: "t-1" } },
      createToolContext("task-reviewer", "reviewer-session"),
    )

    expect(readinessCalls).toEqual([{ sessionId: "reviewer-session", mode: "silent" }])
  })

  it("does NOT trigger readiness for chorus agent (handled via chat.params hook)", async () => {
    const readinessCalls: string[] = []
    const tools = createChorusLazyBridgeTools({
      chorusClient: createClient(),
      readiness: {
        ensureReady: async (sessionId) => {
          readinessCalls.push(sessionId)
        },
      },
    })

    await tools.chorus_tools!.execute({}, createToolContext("chorus"))

    expect(readinessCalls).toEqual([])
  })

  it("gets Chorus tool details by raw Chorus tool name", async () => {
    const tools = createChorusLazyBridgeTools({
      chorusClient: createClient(),
    })

    const result = await tools.chorus_tool_get!.execute({ toolName: "chorus_get_task" }, createToolContext("chorus"))

    expect(readOutput(result)).toContain("chorus_get_task")
    expect(readOutput(result)).toContain("taskUuid")
    expect(readOutput(result)).not.toContain("inputSchema")
  })

  it("fails strict tool lookup when a Chorus tool name does not exist", async () => {
    const tools = createChorusLazyBridgeTools({
      chorusClient: createClient(),
    })

    await expect(tools.chorus_tool_get!.execute({ toolName: "write a task update tool" }, createToolContext("chorus"))).rejects.toThrow(
      'Tool "write a task update tool" not found. Call \`chorus_tools\` first to list available tools.',
    )
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

    await tools.chorus_tools!.execute({}, createToolContext("chorus"))

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

  it("does NOT show a toast when the lazy bridge tool index refreshes — toasts come from readiness coordinator", async () => {
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

    expect(toasts).toHaveLength(0)
  })

  it("does NOT show an error toast when the lazy bridge refresh fails — errors surface from readiness coordinator", async () => {
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

    expect(toasts).toHaveLength(0)
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
      createToolContext("chorus"),
    )

    expect(calls).toEqual([{ name: "chorus_get_task", args: { taskUuid: "task-1" } }])
    expect(readOutput(result)).toContain("task-1")
  })

  it("rejects short aliases and requires raw Chorus tool names", async () => {
    const tools = createChorusLazyBridgeTools({
      chorusClient: createClient(),
    })

    await expect(tools.chorus_tool_execute!.execute({ toolName: "get_task", arguments: { taskUuid: "task-1" } }, createToolContext("chorus"))).rejects.toThrow(
      'Tool "get_task" not found. Call `chorus_tools` first to list available tools.',
    )
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
      createToolContext("chorus"),
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
      createToolContext("chorus"),
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
      createToolContext("chorus"),
    )

    expect(calls[0]).toEqual({
      name: "chorus_add_comment",
      args: { targetType: "task", targetUuid: "task-1", content: "" },
    })
  })

  it("tells agents to call chorus_tools before executing an unknown tool", async () => {
    const tools = createChorusLazyBridgeTools({
      chorusClient: createClient(),
    })

    await expect(tools.chorus_tool_execute!.execute({ toolName: "missing_tool", arguments: {} }, createToolContext("chorus"))).rejects.toThrow(
      'Tool "missing_tool" not found. Call `chorus_tools` first to list available tools.',
    )
  })
})

describe("managed document tool schema overlay", () => {
  it("hides content and exposes required contentPath for chorus_pm_add_document_draft", async () => {
    const tools = createChorusLazyBridgeTools({ chorusClient: createClientWithDocumentTools() })

    const result = await tools.chorus_tool_get!.execute({ toolName: "chorus_pm_add_document_draft" }, createToolContext("chorus"))
    const output = readOutput(result)

    expect(output).toContain("contentPath")
    expect(output).not.toContain('"content"')
    // contentPath is required for add_document_draft
    expect(JSON.parse(output).requiredFields).toContain("contentPath")
  })

  it("hides content and exposes optional contentPath for chorus_pm_update_document_draft", async () => {
    const tools = createChorusLazyBridgeTools({ chorusClient: createClientWithDocumentTools() })

    const result = await tools.chorus_tool_get!.execute({ toolName: "chorus_pm_update_document_draft" }, createToolContext("chorus"))
    const output = JSON.parse(readOutput(result))

    expect(output.optionalFields).toContain("contentPath")
    expect(output.requiredFields).not.toContain("contentPath")
    expect(output.requiredFields).not.toContain("content")
    expect(output.optionalFields).not.toContain("content")
  })

  it("hides content and exposes optional contentPath for chorus_pm_create_document", async () => {
    const tools = createChorusLazyBridgeTools({ chorusClient: createClientWithDocumentTools() })

    const result = await tools.chorus_tool_get!.execute({ toolName: "chorus_pm_create_document" }, createToolContext("chorus"))
    const output = JSON.parse(readOutput(result))

    expect(output.optionalFields).toContain("contentPath")
    expect(output.optionalFields).not.toContain("content")
    expect(output.requiredFields).not.toContain("contentPath")
  })

  it("hides content and exposes optional contentPath for chorus_pm_update_document", async () => {
    const tools = createChorusLazyBridgeTools({ chorusClient: createClientWithDocumentTools() })

    const result = await tools.chorus_tool_get!.execute({ toolName: "chorus_pm_update_document" }, createToolContext("chorus"))
    const output = JSON.parse(readOutput(result))

    expect(output.optionalFields).toContain("contentPath")
    expect(output.optionalFields).not.toContain("content")
  })

  it("does not overlay non-document tools like chorus_update_task", async () => {
    const tools = createChorusLazyBridgeTools({ chorusClient: createClientWithDocumentTools() })

    const result = await tools.chorus_tool_get!.execute({ toolName: "chorus_update_task" }, createToolContext("chorus"))
    const output = readOutput(result)

    expect(output).not.toContain("contentPath")
  })
})

describe("managed document tool execute-time rewrite", () => {
  it("reads the file at contentPath and forwards content to the remote call", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chorus-test-"))
    const filePath = join(dir, "draft.md")
    await writeFile(filePath, "# My PRD\n\nSome content.")

    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    const tools = createChorusLazyBridgeTools({ chorusClient: createClientWithDocumentTools(calls) })

    await tools.chorus_tool_execute!.execute(
      {
        toolName: "chorus_pm_add_document_draft",
        arguments: { proposalUuid: "p-1", type: "prd", title: "My PRD", contentPath: filePath },
      },
      createToolContext("chorus", "session-1", dir)    )

    expect(calls[0]!.args.content).toBe("# My PRD\n\nSome content.")
    expect(calls[0]!.args.contentPath).toBeUndefined()
  })

  it("resolves a relative contentPath against ctx.directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chorus-test-"))
    await mkdir(join(dir, "docs"))
    await writeFile(join(dir, "docs", "prd.md"), "# PRD")

    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    const tools = createChorusLazyBridgeTools({ chorusClient: createClientWithDocumentTools(calls) })

    await tools.chorus_tool_execute!.execute(
      {
        toolName: "chorus_pm_add_document_draft",
        arguments: { proposalUuid: "p-1", type: "prd", title: "T", contentPath: "docs/prd.md" },
      },
      createToolContext("chorus", "session-1", dir)    )

    expect(calls[0]!.args.content).toBe("# PRD")
    expect(calls[0]!.args.contentPath).toBeUndefined()
  })

  it("passes through managed tool call without contentPath when content is optional", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    const tools = createChorusLazyBridgeTools({ chorusClient: createClientWithDocumentTools(calls) })

    await tools.chorus_tool_execute!.execute(
      {
        toolName: "chorus_pm_update_document_draft",
        arguments: { proposalUuid: "p-1", draftUuid: "d-1", title: "New Title" },
      },
      createToolContext("chorus"),
    )

    expect(calls[0]!.args).toEqual({ proposalUuid: "p-1", draftUuid: "d-1", title: "New Title" })
  })

  it("does not interfere with non-document tool arguments", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    const tools = createChorusLazyBridgeTools({ chorusClient: createClientWithDocumentTools(calls) })

    await tools.chorus_tool_execute!.execute(
      {
        toolName: "chorus_update_task",
        arguments: { taskUuid: "t-1", status: "in_progress" },
      },
      createToolContext("chorus"),
    )

    expect(calls[0]!.args).toEqual({ taskUuid: "t-1", status: "in_progress" })
  })
})

describe("managed document tool path-only validation", () => {
  it("rejects inline content for managed document tools", async () => {
    const tools = createChorusLazyBridgeTools({ chorusClient: createClientWithDocumentTools() })

    await expect(
      tools.chorus_tool_execute!.execute(
        {
          toolName: "chorus_pm_add_document_draft",
          arguments: { proposalUuid: "p-1", type: "prd", title: "T", content: "inline body" },
        },
        createToolContext("chorus"),
      ),
    ).rejects.toThrow("requires `contentPath`")
  })

  it("does not make the remote call when inline content is rejected", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    const tools = createChorusLazyBridgeTools({ chorusClient: createClientWithDocumentTools(calls) })

    await expect(
      tools.chorus_tool_execute!.execute(
        {
          toolName: "chorus_pm_add_document_draft",
          arguments: { content: "inline body" },
        },
        createToolContext("chorus"),
      ),
    ).rejects.toThrow()

    expect(calls).toHaveLength(0)
  })

  it("rejects missing contentPath when it is required", async () => {
    const tools = createChorusLazyBridgeTools({ chorusClient: createClientWithDocumentTools() })

    await expect(
      tools.chorus_tool_execute!.execute(
        {
          toolName: "chorus_pm_add_document_draft",
          arguments: { proposalUuid: "p-1", type: "prd", title: "T" },
        },
        createToolContext("chorus"),
      ),
    ).rejects.toThrow(/requires.*contentPath/)
  })

  it("rejects a contentPath pointing to a non-existent file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chorus-test-"))
    const tools = createChorusLazyBridgeTools({ chorusClient: createClientWithDocumentTools() })

    await expect(
      tools.chorus_tool_execute!.execute(
        {
          toolName: "chorus_pm_add_document_draft",
          arguments: { proposalUuid: "p-1", type: "prd", title: "T", contentPath: "no-such-file.md" },
        },
        createToolContext("chorus", "session-1", dir)      ),
    ).rejects.toThrow(/file not found/)
  })

  it("rejects a contentPath pointing to a directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chorus-test-"))
    await mkdir(join(dir, "docs"))
    const tools = createChorusLazyBridgeTools({ chorusClient: createClientWithDocumentTools() })

    await expect(
      tools.chorus_tool_execute!.execute(
        {
          toolName: "chorus_pm_add_document_draft",
          arguments: { proposalUuid: "p-1", type: "prd", title: "T", contentPath: "docs" },
        },
        createToolContext("chorus", "session-1", dir)      ),
    ).rejects.toThrow(/directory/)
  })

  it("rejects a contentPath that resolves outside the workspace root", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chorus-test-"))
    const tools = createChorusLazyBridgeTools({ chorusClient: createClientWithDocumentTools() })

    await expect(
      tools.chorus_tool_execute!.execute(
        {
          toolName: "chorus_pm_add_document_draft",
          arguments: { proposalUuid: "p-1", type: "prd", title: "T", contentPath: "../../etc/passwd" },
        },
        createToolContext("chorus", "session-1", dir)      ),
    ).rejects.toThrow(/outside the permitted/)
  })

  it("accepts a contentPath inside the stagingDir (outside workspace)", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "chorus-workspace-"))
    const stagingDir = await mkdtemp(join(tmpdir(), "chorus-staging-"))
    const stagingFile = join(stagingDir, "prd.md")
    await writeFile(stagingFile, "# PRD from staging")

    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    const bridge = createChorusLazyBridge({
      chorusClient: createClientWithDocumentTools(calls),
      stagingDir,
    })

    await bridge.tools.chorus_tool_execute!.execute(
      {
        toolName: "chorus_pm_add_document_draft",
        arguments: { proposalUuid: "p-1", type: "prd", title: "T", contentPath: stagingFile },
      },
      createToolContext("chorus", "session-1", workspaceDir)
    )

    expect(calls[0]!.args.content).toBe("# PRD from staging")
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

function createClientWithDocumentTools(calls: Array<{ name: string; args: Record<string, unknown> }> = []) {
  return {
    async listTools() {
      return [...createToolDefinitions(), ...createDocumentToolDefinitions()]
    },
    async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
      calls.push({ name, args })
      return { ok: true } as T
    },
  }
}

function createDocumentToolDefinitions() {
  return [
    {
      name: "chorus_pm_add_document_draft",
      description: "Add a document draft to a proposal",
      inputSchema: {
        type: "object",
        required: ["proposalUuid", "type", "title", "content"],
        properties: {
          proposalUuid: { type: "string" },
          type: { type: "string" },
          title: { type: "string" },
          content: { type: "string" },
        },
      },
    },
    {
      name: "chorus_pm_update_document_draft",
      description: "Update a document draft",
      inputSchema: {
        type: "object",
        required: ["proposalUuid", "draftUuid"],
        properties: {
          proposalUuid: { type: "string" },
          draftUuid: { type: "string" },
          title: { type: "string" },
          content: { type: "string" },
        },
      },
    },
    {
      name: "chorus_pm_create_document",
      description: "Create a standalone document",
      inputSchema: {
        type: "object",
        required: ["projectUuid", "type", "title"],
        properties: {
          projectUuid: { type: "string" },
          type: { type: "string" },
          title: { type: "string" },
          content: { type: "string" },
        },
      },
    },
    {
      name: "chorus_pm_update_document",
      description: "Update document content",
      inputSchema: {
        type: "object",
        required: ["documentUuid"],
        properties: {
          documentUuid: { type: "string" },
          title: { type: "string" },
          content: { type: "string" },
        },
      },
    },
  ]
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

function createToolContext(agent = "chorus", sessionID = "session-1", directory = "/tmp/project") {
  return {
    sessionID,
    messageID: "message-1",
    agent,
    directory,
    worktree: directory,
    abort: new AbortController().signal,
    metadata: () => {},
    ask: (() => {}) as never,
  }
}

function readOutput(result: string | { output: string }): string {
  return typeof result === "string" ? result : result.output
}
