import { describe, expect, it } from "bun:test"
import { fetchNotificationByUuid } from "../../src/notifications/notification-pagination"

describe("fetchNotificationByUuid", () => {
  it("searches bounded all-notification pages until it finds the matching notification", async () => {
    const chorusClient = new FakeChorusClient([
      { notifications: [{ uuid: "other-1" }] },
      { notifications: [{ uuid: "target", action: "task_assigned", entityUuid: "task-1", readAt: "2026-01-01T00:00:00.000Z" }] },
    ])

    const result = await fetchNotificationByUuid(chorusClient as never, "target")

    expect(result?.entityUuid).toBe("task-1")
    expect(chorusClient.args).toEqual([
      { status: "all", autoMarkRead: false, limit: 50, offset: 0 },
      { status: "all", autoMarkRead: false, limit: 50, offset: 50 },
    ])
  })
})

class FakeChorusClient {
  args: Array<Record<string, unknown>> = []

  constructor(private readonly pages: unknown[]) {}

  async callTool(_name: string, args: Record<string, unknown>) {
    this.args.push(args)
    return this.pages.shift() ?? { notifications: [] }
  }
}
