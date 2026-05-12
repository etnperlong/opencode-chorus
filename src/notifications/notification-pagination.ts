import type { ChorusMcpClient } from "../chorus/mcp-client"

export type ChorusNotification = {
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
    const notification = extractNotifications(result).find(
      (item) => item.uuid === notificationUuid || item.notificationUuid === notificationUuid,
    )
    if (notification) return notification
  }
}

export async function fetchUnreadNotifications(
  chorusClient: ChorusMcpClient,
  options: { limit?: number; maxPages?: number; stopWhenPageShort?: boolean } = {},
): Promise<ChorusNotification[]> {
  const limit = options.limit ?? 50
  const maxPages = options.maxPages ?? 5
  const stopWhenPageShort = options.stopWhenPageShort ?? true
  const notifications: ChorusNotification[] = []

  for (let page = 0; page < maxPages; page++) {
    const result = await chorusClient.callTool<unknown>("chorus_get_notifications", {
      status: "unread",
      autoMarkRead: false,
      limit,
      offset: page * limit,
    })
    const pageNotifications = extractNotifications(result)
    notifications.push(...pageNotifications)
    if (stopWhenPageShort && pageNotifications.length < limit) break
  }

  return notifications
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
