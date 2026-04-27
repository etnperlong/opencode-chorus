import type { ChorusMcpClient } from "../chorus/mcp-client"
import { deleteSessionFile, writeSessionFile } from "../state/session-files"
import type { StateStore } from "../state/state-store"
import { isTrackedSessionEvent, shouldStartMainSession } from "./session-events"

export class SessionLifecycle {
  constructor(
    private readonly stateStore: StateStore,
    private readonly chorusClient: ChorusMcpClient,
    private readonly chorusUrl: string,
  ) {}

  async start(runtimeSessionId: string, options: { replaceExisting?: boolean } = {}): Promise<void> {
    const current = await this.stateStore.readOpenCodeState()
    if (!options.replaceExisting && !shouldStartMainSession(current.mainSession.runtimeSessionId, runtimeSessionId)) return

    const checkin = await this.chorusClient.callTool<{ session?: { uuid?: string } }>("chorus_checkin")
    const chorusSessionUuid = checkin?.session?.uuid

    await this.stateStore.updateOpenCodeState((state) => ({
      ...state,
      mainSession: {
        runtimeSessionId,
        chorusSessionUuid,
        status: "active",
        lastHeartbeatAt: new Date().toISOString(),
      },
    }))

    if (chorusSessionUuid) {
      await writeSessionFile(this.stateStore.paths, "main", {
        sessionUuid: chorusSessionUuid,
        agentName: "main",
        agentType: "main",
        chorusUrl: this.chorusUrl,
        runtimeSessionId,
        workerKind: "main",
      })
    }
  }

  async heartbeat(runtimeSessionId: string): Promise<void> {
    await this.stateStore.updateOpenCodeState((state) => ({
      ...state,
      mainSession: isTrackedSessionEvent(state.mainSession.runtimeSessionId, runtimeSessionId)
        ? { ...state.mainSession, lastHeartbeatAt: new Date().toISOString() }
        : state.mainSession,
    }))
  }

  async stop(runtimeSessionId: string): Promise<void> {
    let stopped = false
    await this.stateStore.updateOpenCodeState((state) => {
      if (!isTrackedSessionEvent(state.mainSession.runtimeSessionId, runtimeSessionId)) return state
      stopped = true
      return {
        ...state,
        mainSession: {
          status: "closed",
          lastHeartbeatAt: state.mainSession.lastHeartbeatAt,
        },
      }
    })

    if (!stopped) return
    await deleteSessionFile(this.stateStore.paths, "main")
    await this.chorusClient.disconnect()
  }
}
