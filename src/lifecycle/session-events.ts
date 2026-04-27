type MainSessionState = {
  runtimeSessionId?: string
  status: "idle" | "active" | "closed"
}

export function extractSessionEventId(event: unknown): string | undefined {
  if (!isRecord(event)) return undefined
  const properties = isRecord(event.properties) ? event.properties : undefined
  const info = properties && isRecord(properties.info) ? properties.info : undefined
  const id = info?.id ?? properties?.sessionID
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
