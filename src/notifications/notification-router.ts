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
    }
  | {
      kind: "ignored"
      entityUuid?: string
      projectUuid?: string
      message: ""
    }

export function routeNotification(input: NotificationInput): RoutedNotification {
  if (input.action === "task_assigned" && input.entityUuid) {
    return {
      kind: "task_assigned",
      entityUuid: input.entityUuid,
      projectUuid: input.projectUuid,
      message: `[Chorus] Task assigned: ${input.entityTitle ?? input.entityUuid}`,
    }
  }

  return { kind: "ignored", entityUuid: input.entityUuid, projectUuid: input.projectUuid, message: "" }
}
