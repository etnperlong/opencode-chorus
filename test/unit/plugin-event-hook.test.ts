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
    const startCalls: Array<{ sessionId: string; replaceExisting: boolean }> = []

    const hook = createPluginEventHook({
      autoStart: true,
      enableSessionContextSummary: false,
      stateStore: {
        readOpenCodeState: async () => ({ mainSession: { status: "idle", runtimeSessionId: "main" } }),
      } as never,
      sessionLifecycle: {
        start: async (sessionId: string, options: { replaceExisting: boolean }) => {
          startCalls.push({ sessionId, replaceExisting: options.replaceExisting })
        },
        heartbeat: async (sessionId: string) => {
          heartbeatCalls.push(sessionId)
        },
        stop: async (sessionId: string) => {
          stopCalls.push(sessionId)
        },
      } as never,
      logger: { debug: async () => {}, info: async () => {}, warn: async () => {} },
    })

    await hook({ event: { type: "session.idle", properties: { info: { id: "runtime-1" } } } })

    expect(heartbeatCalls).toEqual(["runtime-1"])
    expect(stopCalls).toEqual([])
    expect(startCalls).toEqual([])
  })

  it("marks interrupted reviewer sessions clearly on next startup", async () => {
    const store = await createStore()
    await store.updateOpenCodeState((state) => ({
      ...state,
      mainSession: { status: "idle" },
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
      autoStart: true,
      enableSessionContextSummary: false,
      stateStore: store,
      sessionLifecycle: {
        start: async () => {},
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

  it("uses the first session.updated event as a startup fallback once", async () => {
    const store = await createStore()
    const startCalls: Array<{ sessionId: string; replaceExisting: boolean }> = []
    const surfacedSessions: string[] = []

    const hook = createPluginEventHook({
      autoStart: true,
      enableSessionContextSummary: true,
      stateStore: store,
      sessionLifecycle: {
        start: async (sessionId: string, options: { replaceExisting: boolean }) => {
          startCalls.push({ sessionId, replaceExisting: options.replaceExisting })
        },
        surfaceContextSummary: async (sessionId: string) => {
          surfacedSessions.push(sessionId)
        },
        heartbeat: async () => {},
        stop: async () => {},
      } as never,
      logger: { debug: async () => {}, info: async () => {}, warn: async () => {} },
    })

    await hook({ event: { type: "session.updated", properties: { info: { id: "runtime-updated" } } } })
    await hook({ event: { type: "session.updated", properties: { info: { id: "runtime-updated" } } } })

    expect(startCalls).toEqual([{ sessionId: "runtime-updated", replaceExisting: false }])
    expect(surfacedSessions).toEqual(["runtime-updated"])
  })
})

async function createStore(): Promise<StateStore> {
  const projectRoot = await mkdtemp(join(tmpdir(), "chorus-plugin-event-hook-"))
  const store = new StateStore(projectRoot, ".chorus")
  await store.init()
  return store
}
