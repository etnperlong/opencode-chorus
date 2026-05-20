import type { SessionContextRecord } from "../state/state-types"

export type NotificationScopeSource = "config" | "shared" | "session" | "unresolved"

export type NotificationScopeReason =
  | "project_allowed"
  | "project_not_in_scope"
  | "missing_notification_project"
  | "multiple_session_projects"
  | "missing_scope_context"

export type EffectiveNotificationScope =
  | {
      status: "resolved"
      source: Exclude<NotificationScopeSource, "unresolved">
      projectUuids: string[]
    }
  | {
      status: "unresolved"
      source: "unresolved"
      reason: Extract<NotificationScopeReason, "multiple_session_projects" | "missing_scope_context">
      projectUuids: []
    }

export type NotificationScopeEvaluation =
  | {
      outcome: "in_scope"
      source: Exclude<NotificationScopeSource, "unresolved">
      reason: "project_allowed"
      notificationProjectUuid: string
      scopeProjectUuids: string[]
    }
  | {
      outcome: "out_of_scope"
      source: Exclude<NotificationScopeSource, "unresolved">
      reason: "project_not_in_scope"
      notificationProjectUuid: string
      scopeProjectUuids: string[]
    }
  | {
      outcome: "unresolved"
      source: NotificationScopeSource
      reason: Extract<
        NotificationScopeReason,
        "missing_notification_project" | "multiple_session_projects" | "missing_scope_context"
      >
      notificationProjectUuid?: string
      scopeProjectUuids: string[]
    }

type ResolveEffectiveNotificationScopeInput = {
  configuredProjectUuids?: string[]
  sharedProjectUuid?: string
  sessionProjects?: SessionContextRecord["projects"]
}

type EvaluateNotificationScopeInput = {
  projectUuid?: string
}

export function resolveEffectiveNotificationScope(
  input: ResolveEffectiveNotificationScopeInput,
): EffectiveNotificationScope {
  const configuredProjectUuids = normalizeProjectUuids(input.configuredProjectUuids)
  if (configuredProjectUuids.length > 0) {
    return {
      status: "resolved",
      source: "config",
      projectUuids: configuredProjectUuids,
    }
  }

  const sharedProjectUuid = normalizeString(input.sharedProjectUuid)
  if (sharedProjectUuid) {
    return {
      status: "resolved",
      source: "shared",
      projectUuids: [sharedProjectUuid],
    }
  }

  const sessionProjectUuids = normalizeProjectUuids(input.sessionProjects?.map((project) => project.uuid))
  if (sessionProjectUuids.length === 1) {
    return {
      status: "resolved",
      source: "session",
      projectUuids: sessionProjectUuids,
    }
  }

  return {
    status: "unresolved",
    source: "unresolved",
    reason: sessionProjectUuids.length > 1 ? "multiple_session_projects" : "missing_scope_context",
    projectUuids: [],
  }
}

export function evaluateNotificationScope(
  notification: EvaluateNotificationScopeInput,
  scope: EffectiveNotificationScope,
): NotificationScopeEvaluation {
  const notificationProjectUuid = normalizeString(notification.projectUuid)
  if (!notificationProjectUuid) {
    return {
      outcome: "unresolved",
      source: scope.source,
      reason: "missing_notification_project",
      scopeProjectUuids: scope.projectUuids,
    }
  }

  if (scope.status === "unresolved") {
    return {
      outcome: "unresolved",
      source: scope.source,
      reason: scope.reason,
      notificationProjectUuid,
      scopeProjectUuids: scope.projectUuids,
    }
  }

  if (scope.projectUuids.includes(notificationProjectUuid)) {
    return {
      outcome: "in_scope",
      source: scope.source,
      reason: "project_allowed",
      notificationProjectUuid,
      scopeProjectUuids: scope.projectUuids,
    }
  }

  return {
    outcome: "out_of_scope",
    source: scope.source,
    reason: "project_not_in_scope",
    notificationProjectUuid,
    scopeProjectUuids: scope.projectUuids,
  }
}

function normalizeProjectUuids(values: Array<string | undefined> | undefined): string[] {
  const normalized = values?.map(normalizeString).filter((value): value is string => value !== undefined) ?? []
  return [...new Set(normalized)]
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}
