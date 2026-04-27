import { describe, expect, it } from "bun:test"
import { createPluginEventHook } from "../../src/hooks/plugin-event-hook"

describe("plugin event hook", () => {
  it("routes session.idle events to session heartbeat", async () => {
    const heartbeatCalls: string[] = []
    const stopCalls: string[] = []
    const startCalls: Array<{ sessionId: string; replaceExisting: boolean }> = []

    const hook = createPluginEventHook({
      autoStart: true,
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
      logger: { debug: async () => {} },
    })

    await hook({ event: { type: "session.idle", properties: { info: { id: "runtime-1" } } } })

    expect(heartbeatCalls).toEqual(["runtime-1"])
    expect(stopCalls).toEqual([])
    expect(startCalls).toEqual([])
  })
})
