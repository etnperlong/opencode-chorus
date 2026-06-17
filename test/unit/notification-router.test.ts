import { describe, expect, it } from "bun:test"
import { routeNotification } from "../../src/notifications/notification-router"

describe("routeNotification", () => {
  it("creates a routed task_assigned action", () => {
    expect(
      routeNotification({
        notificationUuid: "notif-1",
        action: "task_assigned",
        entityUuid: "task-1",
        projectUuid: "proj-1",
        entityTitle: "Task A",
      }),
    ).toEqual(expect.objectContaining({ kind: "task_assigned", entityUuid: "task-1", delivery: "assistant_turn" }))
  })

  it("adds an actionable hint for task assignments when enabled", () => {
    expect(
      routeNotification(
        {
          notificationUuid: "notif-1",
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

  it("routes task assignments to an assistant turn when hints are disabled", () => {
    expect(
      routeNotification(
        {
          notificationUuid: "notif-1",
          action: "task_assigned",
          entityUuid: "task-1",
          projectUuid: "proj-1",
          entityTitle: "Task A",
        },
        { enableNotificationHints: false },
      ),
    ).toMatchObject({
      kind: "task_assigned",
      entityUuid: "task-1",
      delivery: "assistant_turn",
    })
  })

  it("routes task verification notifications to an assistant turn", () => {
    expect(
      routeNotification({
        notificationUuid: "notif-verified",
        action: "task_verified",
        entityUuid: "task-1",
        projectUuid: "proj-1",
        entityTitle: "Task A",
      }),
    ).toEqual(
      expect.objectContaining({
        kind: "task_verified",
        delivery: "assistant_turn",
        notificationUuid: "notif-verified",
      }),
    )
  })

  it("routes proposal approvals with an unblocked-tasks follow-up prompt", () => {
    const routed = routeNotification({
      notificationUuid: "notif-proposal",
      action: "proposal_approved",
      entityUuid: "proposal-1",
      projectUuid: "proj-1",
      entityTitle: "Proposal A",
    })

    expect(routed).toEqual(
      expect.objectContaining({
        kind: "proposal_approved",
        delivery: "assistant_turn",
      }),
    )
    expect(routed.kind === "ignored" ? routed.message : routed.prompt).toContain("chorus_get_available_tasks")
  })

  it("routes mentions to an assistant turn", () => {
    expect(
      routeNotification({
        notificationUuid: "notif-mentioned",
        action: "mentioned",
        entityUuid: "task-1",
        projectUuid: "proj-1",
        entityTitle: "Task A",
      }),
    ).toEqual(
      expect.objectContaining({
        kind: "mentioned",
        delivery: "assistant_turn",
      }),
    )
  })

  it("ignores unknown notification actions safely", () => {
    expect(
      routeNotification({
        notificationUuid: "notif-unknown",
        action: "proposal_approved",
        entityUuid: undefined,
        projectUuid: "proj-1",
      }),
    ).toEqual({ kind: "ignored", entityUuid: undefined, projectUuid: "proj-1", message: "" })
  })
})
