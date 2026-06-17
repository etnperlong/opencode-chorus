export type NotificationInput = {
  notificationUuid?: string
  action?: string
  entityUuid?: string
  projectUuid?: string
  entityTitle?: string
}

export type RoutedNotification =
  | {
      notificationUuid: string
      kind: "task_assigned"
      delivery: "assistant_turn" | "context_only"
      entityUuid: string
      projectUuid?: string
      title: string
      toastMessage: string
      prompt: string
      actionHint?: string
    }
  | {
      notificationUuid: string
      kind: "task_verified" | "task_reopened" | "proposal_approved" | "proposal_rejected" | "mentioned"
      delivery: "assistant_turn"
      entityUuid: string
      projectUuid?: string
      title: string
      toastMessage: string
      prompt: string
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
  if (!input.notificationUuid) {
    return { kind: "ignored", entityUuid: input.entityUuid, projectUuid: input.projectUuid, message: "" }
  }

  if (input.action === "task_assigned" && input.entityUuid) {
    const actionHint =
      options.enableNotificationHints === false
        ? undefined
        : `Review task ${input.entityUuid}, then claim it only if you are ready to work on it.`
    const prompt = actionHint
      ? `[Chorus] Task assigned: ${input.entityTitle ?? input.entityUuid}. Task UUID: ${input.entityUuid}, Project UUID: ${input.projectUuid ?? "unknown"}. ${actionHint}`
      : `[Chorus] Task assigned: ${input.entityTitle ?? input.entityUuid}. Task UUID: ${input.entityUuid}, Project UUID: ${input.projectUuid ?? "unknown"}. Review it when ready.`
    return {
      notificationUuid: input.notificationUuid,
      kind: "task_assigned",
      delivery: "assistant_turn",
      entityUuid: input.entityUuid,
      projectUuid: input.projectUuid,
      title: "Task assigned",
      toastMessage: `[Chorus] Task assigned: ${input.entityTitle ?? input.entityUuid}`,
      prompt,
      ...(actionHint ? { actionHint } : {}),
    }
  }

  if (input.action === "task_verified" && input.entityUuid) {
    return {
      notificationUuid: input.notificationUuid,
      kind: "task_verified",
      delivery: "assistant_turn",
      entityUuid: input.entityUuid,
      projectUuid: input.projectUuid,
      title: "Task verified",
      toastMessage: `[Chorus] Task verified: ${input.entityTitle ?? input.entityUuid}`,
      prompt:
        `[Chorus] Task '${input.entityTitle ?? input.entityUuid}' has been verified and is now done ` +
        `(taskUuid: ${input.entityUuid}, projectUuid: ${input.projectUuid ?? "unknown"}). ` +
        `Check if this unblocks other tasks: use chorus_get_unblocked_tasks with projectUuid "${input.projectUuid ?? "unknown"}" to find tasks that are now ready to start.`,
    }
  }

  if (input.action === "task_reopened" && input.entityUuid) {
    return {
      notificationUuid: input.notificationUuid,
      kind: "task_reopened",
      delivery: "assistant_turn",
      entityUuid: input.entityUuid,
      projectUuid: input.projectUuid,
      title: "Task reopened",
      toastMessage: `[Chorus] Task reopened: ${input.entityTitle ?? input.entityUuid}`,
      prompt:
        `[Chorus] Task '${input.entityTitle ?? input.entityUuid}' has been reopened and needs rework ` +
        `(taskUuid: ${input.entityUuid}, projectUuid: ${input.projectUuid ?? "unknown"}). ` +
        `Use chorus_get_task to review the task and chorus_get_comments to inspect verification feedback before continuing.`,
    }
  }

  if (input.action === "proposal_approved" && input.entityUuid) {
    return {
      notificationUuid: input.notificationUuid,
      kind: "proposal_approved",
      delivery: "assistant_turn",
      entityUuid: input.entityUuid,
      projectUuid: input.projectUuid,
      title: "Proposal approved",
      toastMessage: `[Chorus] Proposal approved: ${input.entityTitle ?? input.entityUuid}`,
      prompt:
        `[Chorus] Proposal '${input.entityTitle ?? input.entityUuid}' was approved ` +
        `(proposalUuid: ${input.entityUuid}, projectUuid: ${input.projectUuid ?? "unknown"}). ` +
        `Use chorus_get_available_tasks with projectUuid "${input.projectUuid ?? "unknown"}" to review newly materialized tasks.`,
    }
  }

  if (input.action === "proposal_rejected" && input.entityUuid) {
    return {
      notificationUuid: input.notificationUuid,
      kind: "proposal_rejected",
      delivery: "assistant_turn",
      entityUuid: input.entityUuid,
      projectUuid: input.projectUuid,
      title: "Proposal rejected",
      toastMessage: `[Chorus] Proposal rejected: ${input.entityTitle ?? input.entityUuid}`,
      prompt:
        `[Chorus] Proposal '${input.entityTitle ?? input.entityUuid}' was rejected ` +
        `(proposalUuid: ${input.entityUuid}, projectUuid: ${input.projectUuid ?? "unknown"}). ` +
        `Use chorus_get_proposal and chorus_get_comments to inspect the feedback before revising and resubmitting.`,
    }
  }

  if (input.action === "mentioned" && input.entityUuid) {
    return {
      notificationUuid: input.notificationUuid,
      kind: "mentioned",
      delivery: "assistant_turn",
      entityUuid: input.entityUuid,
      projectUuid: input.projectUuid,
      title: "Mentioned in Chorus",
      toastMessage: `[Chorus] You were mentioned in ${input.entityTitle ?? input.entityUuid}`,
      prompt:
        `[Chorus] You were mentioned in '${input.entityTitle ?? input.entityUuid}' ` +
        `(entityUuid: ${input.entityUuid}, projectUuid: ${input.projectUuid ?? "unknown"}). ` +
        `Use chorus_get_comments to review the conversation and respond appropriately.`,
    }
  }

  return { kind: "ignored", entityUuid: input.entityUuid, projectUuid: input.projectUuid, message: "" }
}
