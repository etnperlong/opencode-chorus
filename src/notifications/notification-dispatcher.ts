import type { StateStore } from "../state/state-store"
import type { RoutedNotification } from "./notification-router"

export async function enqueueRoutedNotification(stateStore: StateStore, routed: RoutedNotification): Promise<void> {
  if (routed.kind === "ignored") return

  const id = routed.notificationUuid
  await stateStore.updateOpenCodeState((state) => {
    if (state.notificationQueue.some((item) => item.id === id)) {
      return state
    }

    const createdAt = new Date().toISOString()

    return {
      ...state,
      notificationQueue: trimNotificationHistory([
        ...state.notificationQueue,
        {
          id,
          notificationUuid: routed.notificationUuid,
          kind: routed.kind,
          delivery: routed.delivery,
          entityUuid: routed.entityUuid,
          projectUuid: routed.projectUuid,
          title: routed.title,
          toastMessage: routed.toastMessage,
          prompt: routed.prompt,
          ...("actionHint" in routed && routed.actionHint ? { actionHint: routed.actionHint } : {}),
          createdAt,
          updatedAt: createdAt,
          attempts: 0,
          status: "pending",
        },
      ]),
    }
  })
}

export async function claimNextQueuedNotification(stateStore: StateStore) {
  let claimed: Awaited<ReturnType<StateStore["readOpenCodeState"]>>["notificationQueue"][number] | undefined

  await stateStore.updateOpenCodeState((state) => {
    const nextIndex = state.notificationQueue.findIndex((item) => item.status === "pending")
    if (nextIndex === -1) return state

    const updatedAt = new Date().toISOString()
    const notificationQueue = state.notificationQueue.map((item, index) => {
      if (index !== nextIndex) return item
      claimed = {
        ...item,
        attempts: item.attempts + 1,
        status: "processing",
        updatedAt,
        lastError: undefined,
      }
      return claimed
    })

    return { ...state, notificationQueue }
  })

  return claimed
}

export async function markQueuedNotificationDone(stateStore: StateStore, notificationUuid: string): Promise<void> {
  await stateStore.updateOpenCodeState((state) => ({
    ...state,
    notificationQueue: trimNotificationHistory(
      state.notificationQueue.map((item) =>
        item.notificationUuid === notificationUuid
          ? { ...item, status: "done", updatedAt: new Date().toISOString(), lastError: undefined }
          : item,
      ),
    ),
  }))
}

export async function markQueuedNotificationFailed(
  stateStore: StateStore,
  notificationUuid: string,
  error: string,
  maxAttempts = 3,
): Promise<void> {
  await stateStore.updateOpenCodeState((state) => ({
    ...state,
    notificationQueue: trimNotificationHistory(
      state.notificationQueue.map((item) => {
        if (item.notificationUuid !== notificationUuid) return item
        return {
          ...item,
          status: item.attempts >= maxAttempts ? "failed" : "pending",
          updatedAt: new Date().toISOString(),
          lastError: error,
        }
      }),
    ),
  }))
}

function trimNotificationHistory(queue: Awaited<ReturnType<StateStore["readOpenCodeState"]>>["notificationQueue"], limit = 100) {
  if (queue.length <= limit) return queue
  const active = queue.filter((item) => item.status === "pending" || item.status === "processing")
  const history = queue.filter((item) => item.status === "done" || item.status === "failed")
  const retainedHistory = history.slice(Math.max(0, history.length - Math.max(0, limit - active.length)))
  return [...active, ...retainedHistory]
}
