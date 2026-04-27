type OpenCodeSessionEvent = {
  type?: string
  properties?: {
    info?: { id?: unknown }
    sessionID?: unknown
  }
}

type MainSessionState = {
  runtimeSessionId?: string
  status: "idle" | "active" | "closed"
}

export function extractSessionEventId(event: OpenCodeSessionEvent): string | undefined {
  const id = event.properties?.info?.id ?? event.properties?.sessionID
  return typeof id === "string" && id.length > 0 ? id : undefined
}

export function shouldStartMainSession(currentRuntimeSessionId: string | undefined, eventRuntimeSessionId: string): boolean {
  return currentRuntimeSessionId === undefined || currentRuntimeSessionId === eventRuntimeSessionId
}

export function shouldReplaceMainSessionOnStartup(
  mainSession: MainSessionState,
  eventRuntimeSessionId: string,
  hasHandledSessionCreated: boolean,
): boolean {
  return (
    !hasHandledSessionCreated &&
    mainSession.status === "active" &&
    mainSession.runtimeSessionId !== undefined &&
    mainSession.runtimeSessionId !== eventRuntimeSessionId
  )
}

export function isTrackedSessionEvent(currentRuntimeSessionId: string | undefined, eventRuntimeSessionId: string): boolean {
  return currentRuntimeSessionId === eventRuntimeSessionId
}
