import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SessionLifecycle } from "../../src/lifecycle/session-lifecycle"
import { StateStore } from "../../src/state/state-store"

describe("SessionLifecycle", () => {
  it("allows a new main session after the tracked session stops", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-"))
    const stateStore = new StateStore(rootDir, ".chorus")
    await stateStore.init()
    const chorusClient = new FakeChorusClient()
    const lifecycle = new SessionLifecycle(stateStore, chorusClient as never, "http://localhost:8637")

    try {
      await lifecycle.start("s-1")
      await lifecycle.stop("s-1")
      await lifecycle.start("s-2")

      const state = await stateStore.readOpenCodeState()
      expect(state.mainSession.runtimeSessionId).toBe("s-2")
      expect(state.mainSession.status).toBe("active")
      expect(chorusClient.checkins).toBe(2)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("replaces a stale active main session during startup recovery", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-"))
    const stateStore = new StateStore(rootDir, ".chorus")
    await stateStore.init()
    await stateStore.updateOpenCodeState((state) => ({
      ...state,
      mainSession: {
        runtimeSessionId: "stale-session",
        chorusSessionUuid: "stale-chorus-session",
        status: "active",
        lastHeartbeatAt: "2026-01-01T00:00:00.000Z",
      },
    }))
    const chorusClient = new FakeChorusClient()
    const lifecycle = new SessionLifecycle(stateStore, chorusClient as never, "http://localhost:8637")

    try {
      await lifecycle.start("fresh-session", { replaceExisting: true })

      const state = await stateStore.readOpenCodeState()
      expect(state.mainSession.runtimeSessionId).toBe("fresh-session")
      expect(state.mainSession.status).toBe("active")
      expect(chorusClient.checkins).toBe(1)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("records compact session context from chorus_checkin", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-"))
    const stateStore = new StateStore(rootDir, ".chorus")
    await stateStore.init()
    const chorusClient = new FakeChorusClient({
      agent: { uuid: "agent-1", name: "OpenCode", roles: ["developer"] },
      owner: { uuid: "user-1", name: "etnperlong" },
      projects: [
        {
          uuid: "project-1",
          name: "OpenCode-Chorus",
          taskCount: 3,
          pendingProposalCount: 1,
        },
      ],
      notifications: [{ uuid: "notification-1" }, { uuid: "notification-2" }],
    })
    const lifecycle = new SessionLifecycle(stateStore, chorusClient as never, "http://localhost:8637")

    try {
      await lifecycle.start("s-context")

      const state = await stateStore.readOpenCodeState()
      expect(state.sessionContext).toMatchObject({
        source: "chorus_checkin",
        runtimeSessionId: "s-context",
        agent: { uuid: "agent-1", name: "OpenCode", roles: ["developer"] },
        owner: { uuid: "user-1", name: "etnperlong" },
        projects: [
          {
            uuid: "project-1",
            name: "OpenCode-Chorus",
            taskCount: 3,
            pendingProposalCount: 1,
          },
        ],
        notifications: { unread: 2 },
      })
      expect(state.sessionContext?.lastRefreshedAt).toBeDefined()
      expect(state.sessionContext?.lastSurfacedAt).toBeUndefined()
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("records unread notification count from documented checkin shape", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-"))
    const stateStore = new StateStore(rootDir, ".chorus")
    await stateStore.init()
    const chorusClient = new FakeChorusClient({ notifications: { unreadCount: 4 } })
    const lifecycle = new SessionLifecycle(stateStore, chorusClient as never, "http://localhost:8637")

    try {
      await lifecycle.start("s-unread-count")

      const state = await stateStore.readOpenCodeState()
      expect(state.sessionContext?.notifications?.unread).toBe(4)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("surfaces compact context once for a runtime session", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-"))
    const stateStore = new StateStore(rootDir, ".chorus")
    await stateStore.init()
    await stateStore.updateOpenCodeState((state) => ({
      ...state,
      sessionContext: {
        source: "chorus_checkin",
        runtimeSessionId: "s-summary",
        lastRefreshedAt: "2026-01-01T00:00:00.000Z",
        agent: { name: "OpenCode", roles: ["developer"] },
        projects: [{ uuid: "project-1", name: "OpenCode-Chorus", taskCount: 3, pendingProposalCount: 1 }],
        notifications: { unread: 2 },
      },
    }))
    const lifecycle = new SessionLifecycle(stateStore, new FakeChorusClient() as never, "http://localhost:8637")
    const messages: string[] = []

    try {
      await lifecycle.surfaceContextSummary("s-summary", { info: async (message) => { messages.push(message) } })
      await lifecycle.surfaceContextSummary("s-summary", { info: async (message) => { messages.push(message) } })

      const state = await stateStore.readOpenCodeState()
      expect(messages).toEqual([
        "Chorus context: OpenCode connected; 2 unread notifications; OpenCode-Chorus has 3 tasks and 1 pending proposal.",
      ])
      expect(state.sessionContext?.lastSurfacedAt).toBeDefined()
      expect(state.sessionContext?.lastSurfacedRuntimeSessionId).toBe("s-summary")
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("re-surfaces context after same-session startup replacement refreshes context", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-"))
    const stateStore = new StateStore(rootDir, ".chorus")
    await stateStore.init()
    const lifecycle = new SessionLifecycle(
      stateStore,
      new FakeChorusClient({
        agent: { name: "OpenCode", roles: ["developer"] },
        projects: [{ uuid: "project-1", name: "OpenCode-Chorus", taskCount: 1 }],
      }) as never,
      "http://localhost:8637",
    )
    const messages: string[] = []
    const logger = { info: async (message: string) => { messages.push(message) } }

    try {
      await lifecycle.start("same-session")
      await lifecycle.surfaceContextSummary("same-session", logger)
      await lifecycle.start("same-session", { replaceExisting: true })
      await lifecycle.surfaceContextSummary("same-session", logger)

      expect(messages).toEqual([
        "Chorus context: OpenCode connected; 0 unread notifications; OpenCode-Chorus has 1 task.",
        "Chorus context: OpenCode connected; 0 unread notifications; OpenCode-Chorus has 1 task.",
      ])
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("does not refresh or re-surface duplicate non-replacement starts for the same active session", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-"))
    const stateStore = new StateStore(rootDir, ".chorus")
    await stateStore.init()
    const chorusClient = new FakeChorusClient({
      agent: { name: "OpenCode", roles: ["developer"] },
      projects: [{ uuid: "project-1", name: "OpenCode-Chorus", taskCount: 1 }],
    })
    const lifecycle = new SessionLifecycle(stateStore, chorusClient as never, "http://localhost:8637")
    const messages: string[] = []
    const logger = { info: async (message: string) => { messages.push(message) } }

    try {
      await lifecycle.start("same-session")
      await lifecycle.surfaceContextSummary("same-session", logger)
      await lifecycle.start("same-session")
      await lifecycle.surfaceContextSummary("same-session", logger)

      expect(chorusClient.checkins).toBe(1)
      expect(messages).toEqual([
        "Chorus context: OpenCode connected; 0 unread notifications; OpenCode-Chorus has 1 task.",
      ])
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})

class FakeChorusClient {
  checkins = 0

  constructor(private readonly checkinResponse: Record<string, unknown> = {}) {}

  async callTool() {
    this.checkins++
    return { session: { uuid: `chorus-${this.checkins}` }, ...this.checkinResponse }
  }

  async disconnect() {}
}
