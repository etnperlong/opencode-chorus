import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NotificationCoordinator } from "../../src/notifications/notification-coordinator"
import { StateStore } from "../../src/state/state-store"

describe("NotificationCoordinator", () => {
  it("delivers an assistant-turn notification on session idle and marks it done", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-notification-coordinator-"))
    const stateStore = new StateStore(rootDir, ".chorus")
    const promptCalls: Array<Record<string, unknown>> = []

    try {
      await stateStore.updateOpenCodeState((state) => ({
        ...state,
        mainSession: { ...state.mainSession, runtimeSessionId: "main-session", status: "active" },
        notificationQueue: [
          {
            id: "notif-1",
            notificationUuid: "notif-1",
            kind: "task_verified",
            delivery: "assistant_turn",
            entityUuid: "task-1",
            projectUuid: "proj-1",
            title: "Task verified",
            toastMessage: "Task A verified",
            prompt: "Use chorus_get_unblocked_tasks for project proj-1.",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            attempts: 0,
            status: "pending",
          },
        ],
      }))

      const coordinator = new NotificationCoordinator({
        chorusUrl: "http://chorus.test",
        apiKey: "key",
        autoStart: true,
        enableNotificationHints: true,
        directory: rootDir,
        stateStore,
        chorusClient: { callTool: async () => ({ notifications: [] }) } as never,
        client: {
          session: {
            prompt: async (input: Record<string, unknown>) => {
              promptCalls.push(input)
              return {}
            },
          },
          tui: {
            showToast: async () => true,
          },
        } as never,
        logger: { debug: async () => {}, info: async () => {}, warn: async () => {}, error: async () => {} },
      })

      await coordinator.handleSessionIdle("main-session")

      expect(promptCalls).toHaveLength(1)
      expect(promptCalls[0]).toMatchObject({
        path: { id: "main-session" },
        body: { parts: [{ type: "text", text: "Use chorus_get_unblocked_tasks for project proj-1." }] },
      })

      const state = await stateStore.readOpenCodeState()
      expect(state.notificationQueue[0]?.status).toBe("done")
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("delivers context-only notifications with noReply enabled", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-notification-coordinator-"))
    const stateStore = new StateStore(rootDir, ".chorus")
    const promptCalls: Array<Record<string, unknown>> = []

    try {
      await stateStore.updateOpenCodeState((state) => ({
        ...state,
        mainSession: { ...state.mainSession, runtimeSessionId: "main-session", status: "active" },
        notificationQueue: [
          {
            id: "notif-1",
            notificationUuid: "notif-1",
            kind: "task_assigned",
            delivery: "context_only",
            entityUuid: "task-1",
            projectUuid: "proj-1",
            title: "Task assigned",
            toastMessage: "Task A assigned",
            prompt: "Review task task-1.",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            attempts: 0,
            status: "pending",
          },
        ],
      }))

      const coordinator = new NotificationCoordinator({
        chorusUrl: "http://chorus.test",
        apiKey: "key",
        autoStart: false,
        enableNotificationHints: false,
        directory: rootDir,
        stateStore,
        chorusClient: { callTool: async () => ({ notifications: [] }) } as never,
        client: {
          session: {
            prompt: async (input: Record<string, unknown>) => {
              promptCalls.push(input)
              return {}
            },
          },
          tui: {
            showToast: async () => true,
          },
        } as never,
        logger: { debug: async () => {}, info: async () => {}, warn: async () => {}, error: async () => {} },
      })

      await coordinator.handleSessionIdle("main-session")

      expect(promptCalls).toHaveLength(1)
      expect(promptCalls[0]).toMatchObject({
        path: { id: "main-session" },
        body: { noReply: true, parts: [{ type: "text", text: "Review task task-1." }] },
      })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("handles a new SSE notification by queueing it and showing a toast", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-notification-coordinator-"))
    const stateStore = new StateStore(rootDir, ".chorus")
    const toastCalls: Array<Record<string, unknown>> = []

    try {
      const coordinator = new NotificationCoordinator({
        chorusUrl: "http://chorus.test",
        apiKey: "key",
        autoStart: true,
        enableNotificationHints: true,
        directory: rootDir,
        stateStore,
        chorusClient: {
          callTool: async (_toolName: string, args: Record<string, unknown>) => ({
            notifications: [
              {
                uuid: args.offset === 0 ? "notif-verified" : undefined,
                action: "task_verified",
                entityUuid: "task-1",
                projectUuid: "proj-1",
                entityTitle: "Task A",
              },
            ],
          }),
        } as never,
        client: {
          session: {
            prompt: async () => ({}),
          },
          tui: {
            showToast: async (input: Record<string, unknown>) => {
              toastCalls.push(input)
              return true
            },
          },
        } as never,
        logger: { debug: async () => {}, info: async () => {}, warn: async () => {}, error: async () => {} },
      })

      await coordinator.handleSseEvent({ type: "new_notification", notificationUuid: "notif-verified" })

      const state = await stateStore.readOpenCodeState()
      expect(state.notificationQueue).toHaveLength(1)
      expect(state.notificationQueue[0]).toMatchObject({
        notificationUuid: "notif-verified",
        kind: "task_verified",
        status: "pending",
      })
      expect(toastCalls).toHaveLength(1)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
