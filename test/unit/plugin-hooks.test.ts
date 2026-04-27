import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createChorusRemoteMcpConfig } from "../../src/chorus/mcp-config"

const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = []
const sessionCalls: Array<{ name: string; args: Record<string, unknown> }> = []
const logCalls: Array<{ level: string; message?: string; extra?: Record<string, unknown> }> = []
const chorusSkillsDir = fileURLToPath(new URL("../../skills/", import.meta.url))
let configDir = ""
let previousConfigDir: string | undefined
let previousChorusApiKey: string | undefined

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
  beforeEach(async () => {
    configDir = await mkdtemp(join(tmpdir(), "opencode-config-"))
    previousConfigDir = process.env.OPENCODE_CONFIG_DIR
    previousChorusApiKey = process.env.CHORUS_API_KEY
    process.env.OPENCODE_CONFIG_DIR = configDir
    delete process.env.CHORUS_API_KEY
  })

  afterEach(async () => {
    toolCalls.length = 0
    sessionCalls.length = 0
    logCalls.length = 0
    if (previousConfigDir === undefined) delete process.env.OPENCODE_CONFIG_DIR
    else process.env.OPENCODE_CONFIG_DIR = previousConfigDir
    if (previousChorusApiKey === undefined) delete process.env.CHORUS_API_KEY
    else process.env.CHORUS_API_KEY = previousChorusApiKey
    await rm(configDir, { recursive: true, force: true })
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

  it("reviews submitted proposals from native Chorus MCP tool names", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
        enableProposalReviewer: true,
      })

      await plugin["tool.execute.after"]?.(
        {
          tool: "chorus_chorus_pm_submit_proposal",
          args: { proposalUuid: "native-proposal" },
          sessionID: "session-1",
        } as never,
        { output: JSON.stringify({ submitted: true }) } as never,
      )

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

  it("reviews submitted tasks from native Chorus MCP tool names", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
        enableTaskReviewer: true,
      })

      await plugin["tool.execute.after"]?.(
        {
          tool: "chorus_chorus_submit_for_verify",
          args: { taskUuid: "native-task" },
          sessionID: "session-1",
        } as never,
        { output: JSON.stringify({ submitted: true }) } as never,
      )

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

  it("persists review verdicts from native Chorus MCP comment tool names", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
      })

      await plugin["tool.execute.after"]?.(
        {
          tool: "chorus_chorus_add_comment",
          args: { targetType: "proposal", targetUuid: "proposal-1", content: "review\nVERDICT: PASS" },
          sessionID: "session-1",
        } as never,
        { output: JSON.stringify({}) } as never,
      )

      const state = JSON.parse(await readFile(join(rootDir, ".chorus", "opencode-state.json"), "utf8"))
      expect(state.reviews["proposal:proposal-1"].lastVerdict).toBe("PASS")
      expect(state.reviews["proposal:proposal-1"].status).toBe("approved")
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

      expect(config.skills).toEqual({
        paths: [chorusSkillsDir],
      })

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

  it("returns config-only fallback behavior when runtime Chorus config is missing", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {})
      const config: Record<string, unknown> = {}

      expect(plugin.config).toBeFunction()
      expect(plugin.event).toBeUndefined()
      expect(plugin.tool).toBeUndefined()
      expect(plugin["tool.execute.after"]).toBeUndefined()

      await plugin.config?.(config as never)

      expect(config.skills).toEqual({
        paths: [chorusSkillsDir],
      })
      expect(config.mcp).toBeUndefined()
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("injects a native Chorus MCP server when runtime config is available", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
      })
      const config: Record<string, unknown> = {
        mcp: {
          context7: {
            type: "remote",
            url: "https://mcp.context7.com/mcp",
            enabled: true,
          },
        },
      }

      await plugin.config?.(config as never)

      expect(config.mcp).toEqual({
        context7: {
          type: "remote",
          url: "https://mcp.context7.com/mcp",
          enabled: true,
        },
        chorus: createChorusRemoteMcpConfig("http://localhost:8637", "test-key"),
      })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("does not inject a native Chorus MCP server when runtime config is missing", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {})
      const config: Record<string, unknown> = {
        mcp: {
          context7: {
            type: "remote",
            url: "https://mcp.context7.com/mcp",
            enabled: true,
          },
        },
      }

      await plugin.config?.(config as never)

      expect(config.mcp).toEqual({
        context7: {
          type: "remote",
          url: "https://mcp.context7.com/mcp",
          enabled: true,
        },
      })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("does not overwrite an existing user-provided chorus MCP entry", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
      })
      const config: Record<string, unknown> = {
        mcp: {
          chorus: {
            type: "remote",
            url: "https://custom.example/mcp",
            enabled: false,
          },
        },
      }

      await plugin.config?.(config as never)

      expect(config.mcp).toEqual({
        chorus: {
          type: "remote",
          url: "https://custom.example/mcp",
          enabled: false,
        },
      })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("rethrows non-missing config load failures", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))
    const configPath = join(configDir, "chorus.json")

    try {
      await writeFile(configPath, "{")

      await expect(createPlugin(createContext(rootDir), {})).rejects.toMatchObject({
        name: "InvalidChorusConfigError",
        configPath,
      })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("returns runtime hooks without plugin-defined wrapper tools when valid Chorus config is present", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
      })

      expect(plugin.config).toBeFunction()
      expect(plugin.event).toBeFunction()
      expect(plugin["tool.execute.after"]).toBeFunction()
      expect(plugin.tool).toBeUndefined()
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("registers bundled Chorus skills without overwriting existing skill paths", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
      })
      const config: Record<string, unknown> = {
        skills: { paths: ["/tmp/custom-skills"] },
      }

      await plugin.config?.(config as never)

      expect(config.skills).toEqual({
        paths: ["/tmp/custom-skills", chorusSkillsDir],
      })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("does not duplicate the bundled Chorus skills path", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
      })
      const config: Record<string, unknown> = {
        skills: { paths: [chorusSkillsDir] },
      }

      await plugin.config?.(config as never)

      const paths = (config.skills as { paths: string[] }).paths
      expect(paths.filter((entry) => entry === chorusSkillsDir)).toHaveLength(1)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("does not duplicate the bundled Chorus skills path when an existing entry omits the trailing separator", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
      })
      const config: Record<string, unknown> = {
        skills: { paths: [chorusSkillsDir.replace(/\/$/, "")] },
      }

      await plugin.config?.(config as never)

      expect((config.skills as { paths: string[] }).paths).toEqual([chorusSkillsDir.replace(/\/$/, "")])
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("warns when apiKey is loaded from chorus.json", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      await writeFile(
        join(configDir, "chorus.json"),
        JSON.stringify({ chorusUrl: "http://localhost:8637", apiKey: "file-key" }),
      )

      await createPlugin(createContext(rootDir), {})

      expect(logCalls).toContainEqual(
        expect.objectContaining({
          level: "warn",
          message: "Chorus API key was loaded from chorus.json; prefer CHORUS_API_KEY for secrets.",
        }),
      )
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
        log: async (input?: { body?: { level?: string; message?: string; extra?: Record<string, unknown> } }) => {
          logCalls.push({
            level: input?.body?.level ?? "",
            message: input?.body?.message,
            extra: input?.body?.extra,
          })
        },
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
