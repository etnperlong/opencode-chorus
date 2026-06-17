import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NotificationCoordinator } from "../../src/notifications/notification-coordinator"
import { StateStore } from "../../src/state/state-store"

describe("NotificationCoordinator scope diagnostics", () => {
  it("records the latest scope evaluation for passive diagnostics", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-notification-scope-"))
    const stateStore = new StateStore(rootDir, ".chorus")

    try {
      const coordinator = new NotificationCoordinator({
        chorusUrl: "http://chorus.test",
        apiKey: "key",
        projectUuids: ["proj-allowed"],
        enableNotificationHints: true,
        directory: rootDir,
        stateStore,
        chorusClient: {
          callTool: async (_toolName: string, args: Record<string, unknown>) => ({
            notifications: [
              {
                uuid: args.offset === 0 ? "notif-out-of-scope" : undefined,
                action: "task_verified",
                entityUuid: "task-1",
                projectUuid: "proj-other",
                entityTitle: "Task A",
                readAt: "2026-01-01T00:00:00.000Z",
              },
            ],
          }),
        } as never,
        client: {
          session: { prompt: async () => ({}) },
          tui: { showToast: async () => true },
        } as never,
        logger: { debug: async () => {}, info: async () => {}, warn: async () => {}, error: async () => {} },
      })

      await coordinator.handleSseEvent({ type: "new_notification", notificationUuid: "notif-out-of-scope" })

      const state = await stateStore.readOpenCodeState()
      expect(state.notificationRuntime?.lastScopeEvaluation).toMatchObject({
        notificationUuid: "notif-out-of-scope",
        outcome: "out_of_scope",
        source: "config",
        reason: "project_not_in_scope",
        notificationProjectUuid: "proj-other",
        scopeProjectUuids: ["proj-allowed"],
      })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
