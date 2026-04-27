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
})

class FakeChorusClient {
  checkins = 0

  async callTool() {
    this.checkins++
    return { session: { uuid: `chorus-${this.checkins}` } }
  }

  async disconnect() {}
}
