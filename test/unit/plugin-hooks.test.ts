import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = []
const sessionCalls: Array<{ name: string; args: Record<string, unknown> }> = []
const logCalls: Array<{ level: string; message?: string; extra?: Record<string, unknown> }> = []
const toastCalls: Array<{ title?: string; message?: string; variant?: string }> = []
let getCommentsResponse: unknown = { comments: [] }
const chorusSkillsDir = fileURLToPath(new URL("../../skills/", import.meta.url))
let configDir = ""
let previousConfigDir: string | undefined
let previousChorusApiKey: string | undefined
let listToolsCalls = 0
let listToolsError: Error | undefined

mock.module("../../src/chorus/mcp-client", () => ({
  ChorusMcpClient: class {
    async listTools() {
      listToolsCalls += 1
      if (listToolsError) throw listToolsError
      return [
        {
          name: "chorus_checkin",
          description: "Check in to Chorus",
          inputSchema: { type: "object", properties: {} },
        },
      ]
    }

    async callTool(name: string, args: Record<string, unknown> = {}) {
      toolCalls.push({ name, args })
      if (name === "chorus_checkin") {
        return {
          session: { uuid: "chorus-session-1" },
          agent: { uuid: "agent-1", name: "OpenCode", roles: ["developer"] },
          projects: [{ uuid: "project-1", name: "OpenCode-Chorus", taskCount: 2, pendingProposalCount: 1 }],
          notifications: [{ uuid: "notification-1" }],
        }
      }
      if (name === "chorus_get_comments") return getCommentsResponse
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
    toastCalls.length = 0
    getCommentsResponse = { comments: [] }
    listToolsCalls = 0
    listToolsError = undefined
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

  it("surfaces compact Chorus context on startup when enabled", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
        enableSessionContextSummary: true,
      })

      await plugin.event?.({ event: { type: "session.created", properties: { info: { id: "session-context" } } } } as never)
      await plugin.event?.({ event: { type: "session.idle", properties: { info: { id: "session-context" } } } } as never)

      expect(logCalls).toContainEqual(
        expect.objectContaining({
          level: "info",
          message: "Chorus context: OpenCode connected; 1 unread notification; OpenCode-Chorus has 2 tasks and 1 pending proposal.",
        }),
      )
      expect(logCalls.filter((call) => call.message?.startsWith("Chorus context:"))).toHaveLength(1)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("stores compact context without surfacing it when disabled", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
        enableSessionContextSummary: false,
      })

      await plugin.event?.({ event: { type: "session.created", properties: { info: { id: "session-context" } } } } as never)

      const state = JSON.parse(await readFile(join(rootDir, ".chorus", "opencode-state.json"), "utf8"))
      expect(state.sessionContext).toMatchObject({
        source: "chorus_checkin",
        runtimeSessionId: "session-context",
        projects: [{ uuid: "project-1", name: "OpenCode-Chorus" }],
      })
      expect(logCalls.some((call) => call.message?.startsWith("Chorus context:"))).toBe(false)
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
        reviewerWaitTimeoutMs: 50,
        reviewerPollIntervalMs: 1,
      })
      getCommentsResponse = { comments: [{ content: "review\nReview-Job-ID: review-session-1\nVERDICT: PASS" }] }
      const output: { title: string; output: string; metadata: unknown } = {
        title: "",
        output: JSON.stringify({ submitted: true }),
        metadata: { preserved: true },
      }

      await plugin["tool.execute.after"]?.(
        {
          tool: "chorus_pm_submit_proposal",
          args: { proposalUuid: "proposal-from-args" },
          sessionID: "session-1",
        } as never,
        output as never,
      )

      expect(toolCalls.map((call) => call.name)).not.toContain("chorus_add_comment")
      expect(sessionCalls).toContainEqual({
        name: "create",
        args: expect.objectContaining({
          responseStyle: "data",
          body: expect.objectContaining({
            parentID: "session-1",
            title: "Chorus proposal review: proposal-from-args (@proposal-reviewer subagent)",
          }),
        }),
      })
      expect(sessionCalls).toContainEqual({
        name: "promptAsync",
        args: expect.objectContaining({
          body: expect.objectContaining({
            agent: "proposal-reviewer",
            parts: [{ type: "text", text: expect.stringContaining("Review-Job-ID: review-session-1") }],
          }),
        }),
      })
      expect(output.title).toBe("Chorus proposal review")
      expect(output.metadata).toEqual({
        preserved: true,
        sessionId: "review-session-1",
        taskId: "review-session-1",
        agent: "proposal-reviewer",
        reviewStatus: "completed",
        verdict: "PASS",
        reviewJobId: "review-session-1",
        reviewRound: 1,
        reviewMaxRounds: 3,
        reviewGateOutputMode: "summary",
        reviewNextAction: "Proceed to proposal approval.",
      })
      expect(output.output).toContain('"reviewer"')
      expect(output.output).toContain('"verdict": "PASS"')
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
        reviewerWaitTimeoutMs: 50,
        reviewerPollIntervalMs: 1,
      })
      getCommentsResponse = { comments: [{ content: "review\nReview-Job-ID: review-session-1\nVERDICT: PASS" }] }

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
        reviewerWaitTimeoutMs: 50,
        reviewerPollIntervalMs: 1,
      })
      getCommentsResponse = { comments: [{ content: "review\nReview-Job-ID: review-session-1\nVERDICT: FAIL" }] }
      const output: { title: string; output: string; metadata: unknown } = {
        title: "",
        output: JSON.stringify({ submitted: true }),
        metadata: "not-an-object",
      }

      await plugin["tool.execute.after"]?.(
        {
          tool: "chorus_submit_for_verify",
          args: { taskUuid: "task-from-args" },
          sessionID: "session-1",
        } as never,
        output as never,
      )

      expect(toolCalls.map((call) => call.name)).not.toContain("chorus_add_comment")
      expect(sessionCalls).toContainEqual({
        name: "create",
        args: expect.objectContaining({
          body: expect.objectContaining({
            parentID: "session-1",
            title: "Chorus task review: task-from-args (@task-reviewer subagent)",
          }),
        }),
      })
      expect(sessionCalls).toContainEqual({
        name: "promptAsync",
        args: expect.objectContaining({
          body: expect.objectContaining({ agent: "task-reviewer" }),
        }),
      })
      expect(output.title).toBe("Chorus task review")
      expect(output.metadata).toEqual({
        sessionId: "review-session-1",
        taskId: "review-session-1",
        agent: "task-reviewer",
        reviewStatus: "completed",
        verdict: "FAIL",
        reviewJobId: "review-session-1",
        reviewRound: 1,
        reviewMaxRounds: 3,
        reviewGateOutputMode: "summary",
        reviewNextAction: "Fix reviewer BLOCKERs, then resubmit for verification.",
      })
      expect(output.output).toContain('"reviewer"')
      expect(output.output).toContain('"verdict": "FAIL"')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("annotates reviewer timeouts on submitted tasks", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
        enableTaskReviewer: true,
        reviewerWaitTimeoutMs: 5,
        reviewerPollIntervalMs: 1,
      })
      getCommentsResponse = { comments: [{ content: "review without verdict" }] }
      const output: { title: string; output: string; metadata: unknown } = {
        title: "",
        output: JSON.stringify({ submitted: true }),
        metadata: { preserved: true },
      }

      await plugin["tool.execute.after"]?.(
        {
          tool: "chorus_submit_for_verify",
          args: { taskUuid: "task-timeout" },
          sessionID: "session-1",
        } as never,
        output as never,
      )

      expect(output.metadata).toEqual({
        preserved: true,
        sessionId: "review-session-1",
        taskId: "review-session-1",
        agent: "task-reviewer",
        reviewStatus: "timeout",
        reviewJobId: "review-session-1",
        reviewRound: 1,
        reviewMaxRounds: 3,
        reviewGateOutputMode: "summary",
        reviewNextAction: "Inspect reviewer session review-session-1 or task comments, then retry the reviewer gate or escalate.",
      })
      expect(output.output).toContain("Reviewer did not finish before timeout")
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
        reviewerWaitTimeoutMs: 50,
        reviewerPollIntervalMs: 1,
      })
      getCommentsResponse = { comments: [{ content: "review\nReview-Job-ID: review-session-1\nVERDICT: PASS" }] }

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

  it("annotates escalated reviewer gates without dispatching another reviewer", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
        enableTaskReviewer: true,
        maxTaskReviewRounds: 1,
      })
      const statePath = join(rootDir, ".chorus", "opencode-state.json")
      const state = JSON.parse(await readFile(statePath, "utf8"))
      state.reviews["task:task-escalated"] = {
        currentRound: 1,
        maxRounds: 1,
        status: "changes-requested",
        lastVerdict: "FAIL",
        lastReviewJobId: "review-session-previous",
        blockersSnapshot: [],
      }
      await writeFile(statePath, JSON.stringify(state, null, 2))

      const output: { title: string; output: string; metadata: unknown } = {
        title: "",
        output: JSON.stringify({ submitted: true }),
        metadata: {},
      }

      await plugin["tool.execute.after"]?.(
        {
          tool: "chorus_submit_for_verify",
          args: { taskUuid: "task-escalated" },
          sessionID: "session-1",
        } as never,
        output as never,
      )

      expect(sessionCalls.map((call) => call.name)).not.toContain("create")
      expect(output.metadata).toMatchObject({
        reviewStatus: "escalated",
        reviewJobId: "review-session-previous",
        reviewRound: 2,
        reviewMaxRounds: 1,
        reviewNextAction: "Escalate for human review before retrying this gate.",
      })
      expect(JSON.parse(output.output).reviewer.status).toBe("escalated")
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
        reviewerWaitTimeoutMs: 50,
        reviewerPollIntervalMs: 1,
      })
      getCommentsResponse = { comments: [{ content: "review\nReview-Job-ID: review-session-1\nVERDICT: PASS" }] }

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
          sessionID: "review-session-1",
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

  it("ignores stale verdict comments from non-current sessions during active review", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
        enableTaskReviewer: true,
        reviewerWaitTimeoutMs: 1,
        reviewerPollIntervalMs: 1,
      })
      getCommentsResponse = { comments: [] }

      await plugin["tool.execute.after"]?.(
        {
          tool: "chorus_submit_for_verify",
          args: { taskUuid: "task-active" },
          sessionID: "session-1",
        } as never,
        { output: JSON.stringify({ submitted: true }) } as never,
      )
      await plugin["tool.execute.after"]?.(
        {
          tool: "chorus_add_comment",
          args: { targetType: "task", targetUuid: "task-active", content: "stale\nVERDICT: FAIL" },
          sessionID: "other-session",
        } as never,
        { output: JSON.stringify({}) } as never,
      )

      const state = JSON.parse(await readFile(join(rootDir, ".chorus", "opencode-state.json"), "utf8"))
      expect(state.reviews["task:task-active"].status).toBe("timed-out")
      expect(state.reviews["task:task-active"].lastVerdict).toBeUndefined()
      expect(state.reviews["task:task-active"].lastReviewJobId).toBe("review-session-1")
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("ignores late verdict comments from old reviewer sessions after current review completes", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
        enableTaskReviewer: true,
        reviewerWaitTimeoutMs: 50,
        reviewerPollIntervalMs: 1,
      })
      getCommentsResponse = { comments: [{ content: "review\nReview-Job-ID: review-session-1\nVERDICT: PASS" }] }

      await plugin["tool.execute.after"]?.(
        {
          tool: "chorus_submit_for_verify",
          args: { taskUuid: "task-completed" },
          sessionID: "session-1",
        } as never,
        { output: JSON.stringify({ submitted: true }) } as never,
      )
      await plugin["tool.execute.after"]?.(
        {
          tool: "chorus_add_comment",
          args: { targetType: "task", targetUuid: "task-completed", content: "late\nVERDICT: FAIL" },
          sessionID: "old-review-session",
        } as never,
        { output: JSON.stringify({}) } as never,
      )

      const state = JSON.parse(await readFile(join(rootDir, ".chorus", "opencode-state.json"), "utf8"))
      expect(state.reviews["task:task-completed"].status).toBe("approved")
      expect(state.reviews["task:task-completed"].lastVerdict).toBe("PASS")
      expect(state.reviews["task:task-completed"].lastReviewJobId).toBe("review-session-1")
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("ignores verdict comments while an active review has no current job id", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
      })
      const statePath = join(rootDir, ".chorus", "opencode-state.json")
      const state = JSON.parse(await readFile(statePath, "utf8"))
      state.reviews["task:task-without-job"] = {
        currentRound: 1,
        maxRounds: 3,
        status: "reviewing",
        blockersSnapshot: [],
      }
      await writeFile(statePath, JSON.stringify(state, null, 2))

      await plugin["tool.execute.after"]?.(
        {
          tool: "chorus_add_comment",
          args: { targetType: "task", targetUuid: "task-without-job", content: "review\nVERDICT: FAIL" },
          sessionID: "some-session",
        } as never,
        { output: JSON.stringify({}) } as never,
      )

      const nextState = JSON.parse(await readFile(statePath, "utf8"))
      expect(nextState.reviews["task:task-without-job"].status).toBe("reviewing")
      expect(nextState.reviews["task:task-without-job"].lastVerdict).toBeUndefined()
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

  it("does not inject a remote Chorus MCP server when runtime config is available", async () => {
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

  it("preserves an existing user-provided chorus MCP entry without adding one", async () => {
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

  it("returns lazy bridge tools when valid Chorus config is present", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
      })

      expect(plugin.config).toBeFunction()
      expect(plugin.event).toBeFunction()
      expect(plugin["tool.execute.after"]).toBeFunction()
      expect(Object.keys(plugin.tool ?? {}).sort()).toEqual(["chorus_tool_execute", "chorus_tool_explore"])
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("refreshes the lazy bridge tool index on session startup", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
      })

      await plugin.event?.({ event: { type: "session.created", properties: { info: { id: "session-lazy" } } } } as never)

      expect(listToolsCalls).toBe(1)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("shows lazy bridge connection status through the OpenCode TUI on session startup", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
      })

      await plugin.event?.({ event: { type: "session.created", properties: { info: { id: "session-1" } } } } as never)

      expect(toastCalls).toContainEqual(
        expect.objectContaining({
          title: "Chorus tools connected",
          message: "1 tools available",
          variant: "success",
        }),
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("does not fail session startup when lazy bridge refresh fails", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-plugin-"))
    listToolsError = new Error("MCP unavailable")

    try {
      const plugin = await createPlugin(createContext(rootDir), {
        chorusUrl: "http://localhost:8637",
        apiKey: "test-key",
      })

      await expect(
        plugin.event?.({ event: { type: "session.created", properties: { info: { id: "session-1" } } } } as never),
      ).resolves.toBeUndefined()
      expect(logCalls).toContainEqual(
        expect.objectContaining({
          level: "warn",
          message: "Failed to refresh Chorus lazy bridge on session startup",
        }),
      )
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
      tui: {
        showToast: async (input: { body?: { title?: string; message?: string; variant?: string } }) => {
          toastCalls.push(input.body ?? {})
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
