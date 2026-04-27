import { describe, expect, it } from "bun:test"
import {
  extractSessionEventId,
  isTrackedSessionEvent,
  shouldReplaceMainSessionOnStartup,
  shouldStartMainSession,
} from "../../src/lifecycle/session-events"

describe("extractSessionEventId", () => {
  it("reads session ids from created and deleted event info", () => {
    expect(extractSessionEventId({ type: "session.created", properties: { info: { id: "created-1" } } })).toBe("created-1")
    expect(extractSessionEventId({ type: "session.deleted", properties: { info: { id: "deleted-1" } } })).toBe("deleted-1")
  })

  it("reads session ids from idle event properties", () => {
    expect(extractSessionEventId({ type: "session.idle", properties: { sessionID: "idle-1" } })).toBe("idle-1")
  })
})

describe("session event scoping", () => {
  it("starts only when no session is tracked or the event matches", () => {
    expect(shouldStartMainSession(undefined, "s-1")).toBe(true)
    expect(shouldStartMainSession("s-1", "s-1")).toBe(true)
    expect(shouldStartMainSession("s-1", "s-2")).toBe(false)
  })

  it("tracks only events for the stored runtime session", () => {
    expect(isTrackedSessionEvent("s-1", "s-1")).toBe(true)
    expect(isTrackedSessionEvent("s-1", "s-2")).toBe(false)
    expect(isTrackedSessionEvent(undefined, "s-1")).toBe(false)
  })

  it("replaces stale active state only for the first startup session", () => {
    const staleActiveSession = { status: "active" as const, runtimeSessionId: "stale-session" }

    expect(shouldReplaceMainSessionOnStartup(staleActiveSession, "fresh-session", false)).toBe(true)
    expect(shouldReplaceMainSessionOnStartup(staleActiveSession, "fresh-session", true)).toBe(false)
    expect(shouldReplaceMainSessionOnStartup(staleActiveSession, "stale-session", false)).toBe(false)
    expect(shouldReplaceMainSessionOnStartup({ status: "closed" as const, runtimeSessionId: "stale-session" }, "fresh-session", false)).toBe(false)
  })
})
