export type NotificationInput = {
  action?: string
  entityUuid?: string
  projectUuid?: string
  entityTitle?: string
}

export type RoutedNotification =
  | {
      kind: "task_assigned"
      entityUuid: string
      projectUuid?: string
      message: string
      actionHint?: string
    }
  | {
      kind: "ignored"
      entityUuid?: string
      projectUuid?: string
      message: ""
    }

type RouteNotificationOptions = {
  enableNotificationHints?: boolean
}

export function routeNotification(input: NotificationInput, options: RouteNotificationOptions = {}): RoutedNotification {
  if (input.action === "task_assigned" && input.entityUuid) {
    return {
      kind: "task_assigned",
      entityUuid: input.entityUuid,
      projectUuid: input.projectUuid,
      message: `[Chorus] Task assigned: ${input.entityTitle ?? input.entityUuid}`,
      actionHint:
        options.enableNotificationHints === false
          ? undefined
          : `Review task ${input.entityUuid}, then claim it only if you are ready to work on it.`,
    }
  }

  return { kind: "ignored", entityUuid: input.entityUuid, projectUuid: input.projectUuid, message: "" }
}
