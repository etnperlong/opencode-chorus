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
        kind: "task_assigned",
        entityUuid: "task-1",
        projectUuid: "proj-1",
        message: "[Chorus] Task assigned: Task A",
        actionHint: "Review task task-1, then claim it only if you are ready to work on it.",
      })
      await enqueueRoutedNotification(stateStore, {
        kind: "task_assigned",
        entityUuid: "task-1",
        projectUuid: "proj-1",
        message: "[Chorus] Task assigned: Task A",
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
            id: "task_assigned:task-1",
            kind: "task_assigned",
            entityUuid: "task-1",
            projectUuid: "proj-1",
            createdAt: "2026-01-01T00:00:00.000Z",
            status: "processing",
          },
        ],
      }))

      await enqueueRoutedNotification(stateStore, {
        kind: "task_assigned",
        entityUuid: "task-1",
        projectUuid: "proj-1",
        message: "[Chorus] Task assigned: Task A",
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
        kind: "task_assigned",
        entityUuid: "task-1",
        projectUuid: "proj-1",
        message: "[Chorus] Task assigned: Task A",
        actionHint: "Review task task-1, then claim it only if you are ready to work on it.",
      })

      const state = await stateStore.readOpenCodeState()

      expect(state.notificationQueue[0]).toMatchObject({
        id: "task_assigned:task-1",
        kind: "task_assigned",
        actionHint: "Review task task-1, then claim it only if you are ready to work on it.",
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
        kind: "task_assigned",
        entityUuid: "task-1",
        projectUuid: "proj-1",
        message: "[Chorus] Task assigned: Task A",
      })

      const state = await stateStore.readOpenCodeState()

      expect(state.notificationQueue[0]?.actionHint).toBeUndefined()
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
