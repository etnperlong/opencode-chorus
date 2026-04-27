import type { ChorusMcpClient } from "../chorus/mcp-client"

type ChorusNotification = {
  uuid?: string
  notificationUuid?: string
  action?: string
  entityUuid?: string
  projectUuid?: string
  entityTitle?: string
}

export async function fetchUnreadNotificationByUuid(
  chorusClient: ChorusMcpClient,
  notificationUuid: string,
): Promise<ChorusNotification | undefined> {
  const limit = 50
  const maxPages = 5

  for (let page = 0; page < maxPages; page++) {
    const result = await chorusClient.callTool<unknown>("chorus_get_notifications", {
      status: "unread",
      autoMarkRead: false,
      limit,
      offset: page * limit,
    })
    const notification = findNotification(result, notificationUuid)
    if (notification) return notification
  }
}

function findNotification(result: unknown, notificationUuid: string): ChorusNotification | undefined {
  return extractNotifications(result).find(
    (notification) => notification.uuid === notificationUuid || notification.notificationUuid === notificationUuid,
  )
}

function extractNotifications(result: unknown): ChorusNotification[] {
  if (Array.isArray(result)) return result.filter(isChorusNotification)
  if (result === null || typeof result !== "object" || Array.isArray(result)) return []

  const notifications = (result as Record<string, unknown>).notifications
  return Array.isArray(notifications) ? notifications.filter(isChorusNotification) : []
}

function isChorusNotification(value: unknown): value is ChorusNotification {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
