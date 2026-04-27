import { afterEach, describe, expect, it, mock } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = []

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

      expect(toolCalls).toContainEqual({
        name: "chorus_add_comment",
        args: expect.objectContaining({ targetType: "proposal", targetUuid: "proposal-from-args" }),
      })
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
    },
  } as never
}
