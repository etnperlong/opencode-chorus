import { describe, expect, it } from "bun:test"
import { evaluateNotificationScope, resolveEffectiveNotificationScope } from "../../src/notifications/notification-scope"

describe("resolveEffectiveNotificationScope", () => {
  it("prefers configured project uuids over shared and session context", () => {
    const scope = resolveEffectiveNotificationScope({
      configuredProjectUuids: ["proj-config-1", "proj-config-2"],
      sharedProjectUuid: "proj-shared",
      sessionProjects: [{ uuid: "proj-session", name: "Session project" }],
    })

    expect(scope).toEqual({
      status: "resolved",
      source: "config",
      projectUuids: ["proj-config-1", "proj-config-2"],
    })
  })

  it("falls back to a single session project when stronger scope signals are absent", () => {
    const scope = resolveEffectiveNotificationScope({
      configuredProjectUuids: [],
      sessionProjects: [{ uuid: "proj-session", name: "Session project" }],
    })

    expect(scope).toEqual({
      status: "resolved",
      source: "session",
      projectUuids: ["proj-session"],
    })
  })

  it("returns unresolved when no unique scope can be proven", () => {
    const scope = resolveEffectiveNotificationScope({
      sessionProjects: [
        { uuid: "proj-a", name: "Project A" },
        { uuid: "proj-b", name: "Project B" },
      ],
    })

    expect(scope).toEqual({
      status: "unresolved",
      source: "unresolved",
      reason: "multiple_session_projects",
      projectUuids: [],
    })
  })
})

describe("evaluateNotificationScope", () => {
  it("distinguishes in-scope and out-of-scope notifications with diagnostic metadata", () => {
    const scope = resolveEffectiveNotificationScope({
      configuredProjectUuids: ["proj-1", "proj-2"],
    })

    expect(evaluateNotificationScope({ projectUuid: "proj-2" }, scope)).toEqual({
      outcome: "in_scope",
      source: "config",
      reason: "project_allowed",
      notificationProjectUuid: "proj-2",
      scopeProjectUuids: ["proj-1", "proj-2"],
    })

    expect(evaluateNotificationScope({ projectUuid: "proj-3" }, scope)).toEqual({
      outcome: "out_of_scope",
      source: "config",
      reason: "project_not_in_scope",
      notificationProjectUuid: "proj-3",
      scopeProjectUuids: ["proj-1", "proj-2"],
    })
  })

  it("reports unresolved when the notification has no project uuid", () => {
    const scope = resolveEffectiveNotificationScope({
      sharedProjectUuid: "proj-shared",
    })

    expect(evaluateNotificationScope({}, scope)).toEqual({
      outcome: "unresolved",
      source: "shared",
      reason: "missing_notification_project",
      scopeProjectUuids: ["proj-shared"],
    })
  })
})
