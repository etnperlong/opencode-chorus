import { describe, expect, it } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createPluginEventHook } from "../../src/hooks/plugin-event-hook"
import { StateStore } from "../../src/state/state-store"

describe("plugin event hook", () => {
  it("routes session.idle events to session heartbeat", async () => {
    const heartbeatCalls: string[] = []
    const stopCalls: string[] = []
    const idleCallbacks: string[] = []

    const hook = createPluginEventHook({
      stateStore: {
        readOpenCodeState: async () => ({ mainSession: { status: "idle", runtimeSessionId: "main" } }),
      } as never,
      sessionLifecycle: {
        heartbeat: async (sessionId: string) => {
          heartbeatCalls.push(sessionId)
        },
        stop: async (sessionId: string) => {
          stopCalls.push(sessionId)
        },
      } as never,
      logger: { debug: async () => {}, info: async () => {}, warn: async () => {} },
      onSessionIdle: async (sessionId: string) => {
        idleCallbacks.push(sessionId)
      },
    })

    await hook({ event: { type: "session.idle", properties: { info: { id: "runtime-1" } } } })

    expect(heartbeatCalls).toEqual(["runtime-1"])
    expect(idleCallbacks).toEqual(["runtime-1"])
    expect(stopCalls).toEqual([])
  })

  it("marks interrupted reviewer sessions clearly on next startup", async () => {
    const store = await createStore()
    await store.updateOpenCodeState((state) => ({
      ...state,
      mainSession: { runtimeSessionId: "runtime-old", status: "active" },
      reviews: {
        "task:task-interrupted": {
          currentRound: 1,
          maxRounds: 3,
          status: "reviewing",
          lastReviewJobId: "review-job-interrupted",
          blockersSnapshot: [],
        },
      },
    }))

    const hook = createPluginEventHook({
      stateStore: store,
      sessionLifecycle: {
        heartbeat: async () => {},
        stop: async () => {},
      } as never,
      logger: { debug: async () => {}, info: async () => {}, warn: async () => {} },
    })

    await hook({ event: { type: "session.created", properties: { info: { id: "runtime-2" } } } })
    const state = await store.readOpenCodeState()

    expect(state.reviews["task:task-interrupted"]).toMatchObject({
      status: "interrupted",
      lastReviewJobId: "review-job-interrupted",
      lastGateStatus: "interrupted",
      lastGateMessage: "Reviewer session was interrupted before posting a verdict",
    })
  })

  it("does NOT call checkin or bridge refresh on session.created — readiness is deferred", async () => {
    const store = await createStore()
    const checkinCalls: string[] = []
    const readyCalls: string[] = []

    const hook = createPluginEventHook({
      stateStore: store,
      sessionLifecycle: {
        // start should NOT be called from the event hook anymore
        start: async (sessionId: string) => {
          checkinCalls.push(sessionId)
        },
        heartbeat: async () => {},
        stop: async () => {},
      } as never,
      logger: { debug: async () => {}, info: async () => {}, warn: async () => {} },
      onSessionReady: async (sessionId: string) => {
        readyCalls.push(sessionId)
      },
    })

    await hook({ event: { type: "session.created", properties: { info: { id: "runtime-deferred" } } } })

    expect(checkinCalls).toEqual([])
    expect(readyCalls).toEqual(["runtime-deferred"])
  })

  it("uses the first session.updated event as a startup fallback once", async () => {
    const store = await createStore()
    const readySessions: string[] = []
    const endedSessions: Array<{ sessionId: string; trackedMainSession: boolean }> = []

    await store.updateOpenCodeState((state) => ({
      ...state,
      mainSession: { runtimeSessionId: "runtime-updated", status: "active" },
    }))

    const hook = createPluginEventHook({
      stateStore: store,
      sessionLifecycle: {
        heartbeat: async () => {},
        stop: async () => {},
      } as never,
      logger: { debug: async () => {}, info: async () => {}, warn: async () => {} },
      onSessionReady: async (sessionId: string) => {
        readySessions.push(sessionId)
      },
      onSessionEnded: async (sessionId: string, details) => {
        endedSessions.push({ sessionId, trackedMainSession: details.trackedMainSession })
      },
    })

    await hook({ event: { type: "session.updated", properties: { info: { id: "runtime-updated" } } } })
    await hook({ event: { type: "session.updated", properties: { info: { id: "runtime-updated" } } } })

    // onSessionReady called exactly once (first session.updated only)
    expect(readySessions).toEqual(["runtime-updated"])
    // session deletion triggers onSessionEnded
    await hook({ event: { type: "session.deleted", properties: { info: { id: "runtime-updated" } } } })
    expect(endedSessions).toEqual([{ sessionId: "runtime-updated", trackedMainSession: true }])
  })
})

async function createStore(): Promise<StateStore> {
  const projectRoot = await mkdtemp(join(tmpdir(), "chorus-plugin-event-hook-"))
  const store = new StateStore(projectRoot, ".chorus")
  await store.init()
  return store
}
