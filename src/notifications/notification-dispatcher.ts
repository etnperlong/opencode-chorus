import type { StateStore } from "../state/state-store"
import type { RoutedNotification } from "./notification-router"

export async function enqueueRoutedNotification(stateStore: StateStore, routed: RoutedNotification): Promise<void> {
  const id = `${routed.kind}:${routed.entityUuid}`
  await stateStore.updateOpenCodeState((state) => {
    if (state.notificationQueue.some((item) => item.id === id && (item.status === "pending" || item.status === "processing"))) {
      return state
    }

    return {
      ...state,
      notificationQueue: [
        ...state.notificationQueue,
        {
          id,
          kind: routed.kind,
          entityUuid: routed.entityUuid,
          projectUuid: routed.projectUuid,
          createdAt: new Date().toISOString(),
          status: "pending",
        },
      ],
    }
  })
}
