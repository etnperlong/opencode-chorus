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
})
