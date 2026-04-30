import { describe, expect, it } from "bun:test"
import { routeNotification } from "../../src/notifications/notification-router"

describe("routeNotification", () => {
  it("creates a routed task_assigned action", () => {
    expect(
      routeNotification({
        action: "task_assigned",
        entityUuid: "task-1",
        projectUuid: "proj-1",
        entityTitle: "Task A",
      }),
    ).toEqual(expect.objectContaining({ kind: "task_assigned", entityUuid: "task-1" }))
  })

  it("adds an actionable hint for task assignments when enabled", () => {
    expect(
      routeNotification(
        {
          action: "task_assigned",
          entityUuid: "task-1",
          projectUuid: "proj-1",
          entityTitle: "Task A",
        },
        { enableNotificationHints: true },
      ),
    ).toEqual(
      expect.objectContaining({
        kind: "task_assigned",
        actionHint: "Review task task-1, then claim it only if you are ready to work on it.",
      }),
    )
  })

  it("routes task assignments quietly when hints are disabled", () => {
    expect(
      routeNotification(
        {
          action: "task_assigned",
          entityUuid: "task-1",
          projectUuid: "proj-1",
          entityTitle: "Task A",
        },
        { enableNotificationHints: false },
      ),
    ).toEqual(
      expect.objectContaining({
        kind: "task_assigned",
        entityUuid: "task-1",
        actionHint: undefined,
      }),
    )
  })

  it("ignores unknown notification actions safely", () => {
    expect(
      routeNotification({
        action: "proposal_approved",
        entityUuid: "proposal-1",
        projectUuid: "proj-1",
      }),
    ).toEqual({ kind: "ignored", entityUuid: "proposal-1", projectUuid: "proj-1", message: "" })
  })
})
