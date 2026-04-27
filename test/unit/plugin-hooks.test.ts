import { afterEach, describe, expect, it, mock } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = []
const sessionCalls: Array<{ name: string; args: Record<string, unknown> }> = []

mock.module("../../src/chorus/mcp-client", () => ({
  ChorusMcpClient: class {
    async callTool(name: string, args: Record<string, unknown> = {}) {
      toolCalls.push({ name, args })
      if (name === "chorus_checkin") return { session: { uuid: "chorus-session-1" } }
      return {}
    }

    async disconnect() {}
  },
}))

mock.module("../../src/notifications/sse-listener", () => ({
  ChorusSseListener: class {
    async connect() {}
    disconnect() {}
  },
}))

const { createPlugin } = await import("../../src/index")

describe("plugin hooks", () => {
  afterEach(() => {
    toolCalls.length = 0
    sessionCalls.length = 0
  })

  it("does not check in or start the main Chorus session when autoStart is false", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
        autoStart: false,
      })

      await plugin.event?.({ event: { type: "session.created", properties: { info: { id: "session-1" } } } } as never)

      expect(toolCalls.map((call) => call.name)).not.toContain("chorus_checkin")
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("reviews submitted proposals using proposalUuid from args when output omits it", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
        enableProposalReviewer: true,
      })

      await plugin["tool.execute.after"]?.(
        {
          tool: "chorus_pm_submit_proposal",
          args: { proposalUuid: "proposal-from-args" },
          sessionID: "session-1",
        } as never,
        { output: JSON.stringify({ submitted: true }) } as never,
      )

      expect(toolCalls.map((call) => call.name)).not.toContain("chorus_add_comment")
      expect(sessionCalls).toContainEqual({
        name: "create",
        args: expect.objectContaining({ responseStyle: "data" }),
      })
      expect(sessionCalls).toContainEqual({
        name: "promptAsync",
        args: expect.objectContaining({
          body: expect.objectContaining({ agent: "proposal-reviewer" }),
        }),
      })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("reviews submitted tasks using a task reviewer session", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
        enableTaskReviewer: true,
      })

      await plugin["tool.execute.after"]?.(
        {
          tool: "chorus_submit_for_verify",
          args: { taskUuid: "task-from-args" },
          sessionID: "session-1",
        } as never,
        { output: JSON.stringify({ submitted: true }) } as never,
      )

      expect(toolCalls.map((call) => call.name)).not.toContain("chorus_add_comment")
      expect(sessionCalls).toContainEqual({
        name: "promptAsync",
        args: expect.objectContaining({
          body: expect.objectContaining({ agent: "task-reviewer" }),
        }),
      })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("persists task review verdicts from reviewer comments", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
        enableTaskReviewer: true,
      })

      await plugin["tool.execute.after"]?.(
        {
          tool: "chorus_submit_for_verify",
          args: { taskUuid: "task-1" },
          sessionID: "session-1",
        } as never,
        { output: JSON.stringify({ submitted: true }) } as never,
      )
      await plugin["tool.execute.after"]?.(
        {
          tool: "chorus_add_comment",
          args: { targetType: "task", targetUuid: "task-1", content: "review\nVERDICT: FAIL" },
          sessionID: "session-1",
        } as never,
        { output: JSON.stringify({}) } as never,
      )

      const state = JSON.parse(await readFile(join(rootDir, ".chorus", "opencode-state.json"), "utf8"))
      expect(state.reviews["task:task-1"].lastVerdict).toBe("FAIL")
      expect(state.reviews["task:task-1"].status).toBe("changes-requested")
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("ignores non-verdict reviewer comments", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
      })

      await plugin["tool.execute.after"]?.(
        {
          tool: "chorus_add_comment",
          args: { targetType: "task", targetUuid: "task-1", content: "review without verdict" },
          sessionID: "session-1",
        } as never,
        { output: JSON.stringify({}) } as never,
      )

      const state = JSON.parse(await readFile(join(rootDir, ".chorus", "opencode-state.json"), "utf8"))
      expect(state.reviews["task:task-1"]?.lastVerdict).toBeUndefined()
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("registers reviewer agents with OpenCode step budgets", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
      })
      const config: Record<string, unknown> = {}

      await plugin.config?.(config as never)

      const agents = config.agent as Record<string, Record<string, unknown>>
      const proposalReviewer = agents["proposal-reviewer"]
      const taskReviewer = agents["task-reviewer"]

      expect(proposalReviewer).toBeDefined()
      expect(taskReviewer).toBeDefined()
      expect(proposalReviewer).toMatchObject({
        mode: "subagent",
        maxSteps: 20,
      })
      expect(proposalReviewer?.prompt).toContain("Hard stop rule")
      expect(taskReviewer).toMatchObject({
        mode: "subagent",
        maxSteps: 25,
      })
      expect(taskReviewer?.prompt).toContain("targeted re-verification")
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})

function createContext(directory: string) {
  return {
    directory,
    worktree: directory,
    client: {
      app: {
        log: async () => {},
      },
      session: {
        create: async (args: Record<string, unknown>) => {
          sessionCalls.push({ name: "create", args })
          return { id: `review-session-${sessionCalls.length}` }
        },
        promptAsync: async (args: Record<string, unknown>) => {
          sessionCalls.push({ name: "promptAsync", args })
        },
      },
    },
  } as never
}
