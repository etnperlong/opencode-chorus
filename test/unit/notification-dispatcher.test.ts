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
      })
      await enqueueRoutedNotification(stateStore, {
        kind: "task_assigned",
        entityUuid: "task-1",
        projectUuid: "proj-1",
        message: "[Chorus] Task assigned: Task A",
      })

      const state = await stateStore.readOpenCodeState()

      expect(state.notificationQueue).toHaveLength(1)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
