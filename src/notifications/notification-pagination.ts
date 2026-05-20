import type { ChorusMcpClient } from "../chorus/mcp-client"

export type NotificationReadStatus = "unread" | "read" | "all"

export type ChorusNotification = {
  uuid?: string
  notificationUuid?: string
  action?: string
  entityUuid?: string
  projectUuid?: string
  entityTitle?: string
  message?: string
  actorName?: string
  createdAt?: string
  readAt?: string | null
}

export async function fetchNotificationByUuid(
  chorusClient: ChorusMcpClient,
  notificationUuid: string,
  options: { status?: NotificationReadStatus; limit?: number; maxPages?: number } = {},
): Promise<ChorusNotification | undefined> {
  const limit = options.limit ?? 50
  const maxPages = options.maxPages ?? 5
  const status = options.status ?? "all"

  for (let page = 0; page < maxPages; page++) {
    const result = await chorusClient.callTool<unknown>("chorus_get_notifications", {
      status,
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

export async function fetchNotifications(
  chorusClient: ChorusMcpClient,
  options: { status?: NotificationReadStatus; limit?: number; maxPages?: number; stopWhenPageShort?: boolean } = {},
): Promise<ChorusNotification[]> {
  const status = options.status ?? "all"
  const limit = options.limit ?? 50
  const maxPages = options.maxPages ?? 5
  const stopWhenPageShort = options.stopWhenPageShort ?? true
  const notifications: ChorusNotification[] = []

  for (let page = 0; page < maxPages; page++) {
    const result = await chorusClient.callTool<unknown>("chorus_get_notifications", {
      status,
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

export function newestNotificationCreatedAt(notifications: ChorusNotification[]): string | undefined {
  return notifications.reduce<string | undefined>((latest, notification) => {
    const createdAt = notification.createdAt
    if (!createdAt) return latest
    if (!latest) return createdAt
    return compareIsoTimestamp(createdAt, latest) > 0 ? createdAt : latest
  }, undefined)
}

export function filterNotificationsCreatedAfter(
  notifications: ChorusNotification[],
  afterCreatedAt: string | undefined,
): ChorusNotification[] {
  if (!afterCreatedAt) return []
  return notifications.filter((notification) => compareIsoTimestamp(notification.createdAt, afterCreatedAt) > 0)
}

export function sortNotificationsByCreatedAtAsc(notifications: ChorusNotification[]): ChorusNotification[] {
  return [...notifications].sort((left, right) => compareIsoTimestamp(left.createdAt, right.createdAt))
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

function compareIsoTimestamp(left: string | undefined, right: string | undefined): number {
  const leftTime = left ? Date.parse(left) : Number.NEGATIVE_INFINITY
  const rightTime = right ? Date.parse(right) : Number.NEGATIVE_INFINITY
  return leftTime - rightTime
}
