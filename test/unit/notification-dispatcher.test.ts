import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { enqueueRoutedNotification } from "../../src/notifications/notification-dispatcher"
import { StateStore } from "../../src/state/state-store"

describe("enqueueRoutedNotification", () => {
  it("does not append a duplicate pending queue item", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-notifications-"))
    const stateStore = new StateStore(rootDir, ".chorus")
    await stateStore.init()

    try {
      await enqueueRoutedNotification(stateStore, {
        notificationUuid: "notif-1",
        kind: "task_assigned",
        entityUuid: "task-1",
        projectUuid: "proj-1",
        title: "Task assigned",
        toastMessage: "[Chorus] Task assigned: Task A",
        prompt: "Review task task-1.",
        delivery: "assistant_turn",
        actionHint: "Review task task-1, then claim it only if you are ready to work on it.",
      })
      await enqueueRoutedNotification(stateStore, {
        notificationUuid: "notif-1",
        kind: "task_assigned",
        entityUuid: "task-1",
        projectUuid: "proj-1",
        title: "Task assigned",
        toastMessage: "[Chorus] Task assigned: Task A",
        prompt: "Review task task-1.",
        delivery: "assistant_turn",
        actionHint: "Review task task-1, then claim it only if you are ready to work on it.",
      })

      const state = await stateStore.readOpenCodeState()

      expect(state.notificationQueue).toHaveLength(1)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("does not append a duplicate processing queue item", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-notifications-"))
    const stateStore = new StateStore(rootDir, ".chorus")
    await stateStore.init()

      try {
        await stateStore.updateOpenCodeState((state) => ({
          ...state,
          notificationQueue: [
            {
              id: "notif-1",
              notificationUuid: "notif-1",
              kind: "task_assigned",
              delivery: "assistant_turn",
              entityUuid: "task-1",
              projectUuid: "proj-1",
              title: "Task assigned",
              toastMessage: "[Chorus] Task assigned: Task A",
              prompt: "Review task task-1.",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              attempts: 1,
              status: "processing",
            },
          ],
        }))

        await enqueueRoutedNotification(stateStore, {
          notificationUuid: "notif-1",
          kind: "task_assigned",
          entityUuid: "task-1",
          projectUuid: "proj-1",
          title: "Task assigned",
          toastMessage: "[Chorus] Task assigned: Task A",
          prompt: "Review task task-1.",
          delivery: "assistant_turn",
          actionHint: "Review task task-1, then claim it only if you are ready to work on it.",
        })

      const state = await stateStore.readOpenCodeState()

      expect(state.notificationQueue).toHaveLength(1)
      expect(state.notificationQueue[0]?.status).toBe("processing")
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("persists actionable hints on queued notifications", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-notifications-"))
    const stateStore = new StateStore(rootDir, ".chorus")
    await stateStore.init()

    try {
      await enqueueRoutedNotification(stateStore, {
        notificationUuid: "notif-1",
        kind: "task_assigned",
        entityUuid: "task-1",
        projectUuid: "proj-1",
        title: "Task assigned",
        toastMessage: "[Chorus] Task assigned: Task A",
        prompt: "Review task task-1.",
        delivery: "assistant_turn",
        actionHint: "Review task task-1, then claim it only if you are ready to work on it.",
      })

      const state = await stateStore.readOpenCodeState()

      expect(state.notificationQueue[0]).toMatchObject({
        id: "notif-1",
        notificationUuid: "notif-1",
        kind: "task_assigned",
        delivery: "assistant_turn",
        prompt: "Review task task-1.",
        actionHint: "Review task task-1, then claim it only if you are ready to work on it.",
        attempts: 0,
        status: "pending",
      })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("does not add hint text when routed quietly", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-notifications-"))
    const stateStore = new StateStore(rootDir, ".chorus")
    await stateStore.init()

    try {
      await enqueueRoutedNotification(stateStore, {
        notificationUuid: "notif-1",
        kind: "task_assigned",
        entityUuid: "task-1",
        projectUuid: "proj-1",
        title: "Task assigned",
        toastMessage: "[Chorus] Task assigned: Task A",
        prompt: "Review task task-1.",
        delivery: "context_only",
      })

      const state = await stateStore.readOpenCodeState()

      expect(state.notificationQueue[0]?.actionHint).toBeUndefined()
      expect(state.notificationQueue[0]?.delivery).toBe("context_only")
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("allows the same entity to queue again when the notification UUID differs", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-notifications-"))
    const stateStore = new StateStore(rootDir, ".chorus")
    await stateStore.init()

    try {
      await enqueueRoutedNotification(stateStore, {
        notificationUuid: "notif-1",
        kind: "task_verified",
        entityUuid: "task-1",
        projectUuid: "proj-1",
        title: "Task verified",
        toastMessage: "Task A verified",
        prompt: "Inspect unblocked tasks.",
        delivery: "assistant_turn",
      })
      await enqueueRoutedNotification(stateStore, {
        notificationUuid: "notif-2",
        kind: "task_verified",
        entityUuid: "task-1",
        projectUuid: "proj-1",
        title: "Task verified",
        toastMessage: "Task A verified again",
        prompt: "Inspect unblocked tasks again.",
        delivery: "assistant_turn",
      })

      const state = await stateStore.readOpenCodeState()

      expect(state.notificationQueue).toHaveLength(2)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
