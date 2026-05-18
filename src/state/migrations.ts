import type { ProjectStateMetadata } from "./paths"
import type { OpenCodeState, SharedState } from "./state-types"

export type RuntimeOpenCodeState = Pick<
  OpenCodeState,
  "mainSession" | "planningScopes" | "workers" | "sessionContext" | "lazyBridge" | "notificationRuntime" | "checkpoints"
>

export type PersistedOpenCodeState = Pick<
  OpenCodeState,
  "version" | "runtime" | "updatedAt" | "project" | "reviews" | "notificationQueue"
>

export function createDefaultRuntimeState(): RuntimeOpenCodeState {
  return {
    mainSession: { status: "idle" },
    planningScopes: {},
    workers: {},
    checkpoints: {},
  }
}

export function createDefaultOpenCodeState(project?: ProjectStateMetadata): OpenCodeState {
  return {
    version: 1,
    runtime: "opencode",
    updatedAt: new Date().toISOString(),
    ...(project ? { project } : {}),
    ...createDefaultRuntimeState(),
    reviews: {},
    notificationQueue: [],
  }
}

export function createDefaultSharedState(): SharedState {
  return {
    version: 1,
    context: {},
    orphanHints: [],
  }
}

export function migrateOpenCodeState(input: unknown, project?: ProjectStateMetadata): OpenCodeState {
  if (!input || typeof input !== "object") return createDefaultOpenCodeState(project)
  const state = input as Partial<OpenCodeState>
  const now = new Date().toISOString()
  return {
    ...createDefaultOpenCodeState(project),
    version: 1,
    runtime: "opencode",
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : now,
    ...(sanitizeProjectMetadata(state.project) ?? project ? { project: sanitizeProjectMetadata(state.project) ?? project } : {}),
    reviews: state.reviews ?? {},
    notificationQueue: Array.isArray(state.notificationQueue)
      ? state.notificationQueue
          .map((item) => sanitizeQueuedNotification(item, now))
          .filter((item): item is NonNullable<typeof item> => item !== undefined)
      : [],
  }
}

export function mergeOpenCodeState(persisted: OpenCodeState, runtime: RuntimeOpenCodeState): OpenCodeState {
  return {
    ...persisted,
    ...runtime,
  }
}

export function extractRuntimeOpenCodeState(state: OpenCodeState): RuntimeOpenCodeState {
  return {
    mainSession: isMainSessionRecord(state.mainSession) ? state.mainSession : { status: "idle" },
    planningScopes: isRecord(state.planningScopes) ? state.planningScopes : {},
    workers: isRecord(state.workers) ? state.workers : {},
    sessionContext: isSessionContextRecord(state.sessionContext) ? state.sessionContext : undefined,
    lazyBridge: isLazyBridgeStatusRecord(state.lazyBridge) ? sanitizeLazyBridgeStatus(state.lazyBridge) : undefined,
    notificationRuntime: isNotificationRuntimeRecord(state.notificationRuntime)
      ? sanitizeNotificationRuntime(state.notificationRuntime)
      : undefined,
    checkpoints: isRecord(state.checkpoints) ? state.checkpoints : {},
  }
}

export function serializeOpenCodeState(state: OpenCodeState, project?: ProjectStateMetadata): PersistedOpenCodeState {
  return {
    version: 1,
    runtime: "opencode",
    updatedAt: state.updatedAt,
    ...(state.project ?? project ? { project: state.project ?? project } : {}),
    reviews: state.reviews ?? {},
    notificationQueue: state.notificationQueue ?? [],
  }
}

export function hasPersistedOpenCodeChanges(current: OpenCodeState, next: OpenCodeState): boolean {
  return JSON.stringify(persistedChangeShape(current)) !== JSON.stringify(persistedChangeShape(next))
}

function persistedChangeShape(state: OpenCodeState) {
  return {
    project: state.project,
    reviews: state.reviews ?? {},
    notificationQueue: state.notificationQueue ?? [],
  }
}

function isMainSessionRecord(value: unknown): value is OpenCodeState["mainSession"] {
  return isRecord(value) && (value.status === "idle" || value.status === "active" || value.status === "closed")
}

function isLazyBridgeStatusRecord(value: unknown): value is OpenCodeState["lazyBridge"] {
  return isRecord(value) && typeof value.status === "string"
}

function sanitizeLazyBridgeStatus(value: OpenCodeState["lazyBridge"]): OpenCodeState["lazyBridge"] {
  if (!value) return undefined
  return {
    status: value.status,
    ...(typeof value.lastRefreshStartedAt === "string" ? { lastRefreshStartedAt: value.lastRefreshStartedAt } : {}),
    ...(typeof value.lastRefreshSucceededAt === "string" ? { lastRefreshSucceededAt: value.lastRefreshSucceededAt } : {}),
    ...(typeof value.lastRefreshFailedAt === "string" ? { lastRefreshFailedAt: value.lastRefreshFailedAt } : {}),
    ...(typeof value.toolCount === "number" ? { toolCount: value.toolCount } : {}),
    ...(typeof value.chorusUrl === "string" ? { chorusUrl: value.chorusUrl } : {}),
    ...(value.agent ? { agent: value.agent } : {}),
    ...(value.scope ? { scope: value.scope } : {}),
    ...(typeof value.lastError === "string" ? { lastError: value.lastError } : {}),
  }
}

function isNotificationRuntimeRecord(value: unknown): value is OpenCodeState["notificationRuntime"] {
  return isRecord(value) && typeof value.status === "string"
}

function sanitizeNotificationRuntime(value: OpenCodeState["notificationRuntime"]): OpenCodeState["notificationRuntime"] {
  if (!value) return undefined
  return {
    status: value.status,
    ...(typeof value.lastEventAt === "string" ? { lastEventAt: value.lastEventAt } : {}),
    ...(typeof value.lastConnectedAt === "string" ? { lastConnectedAt: value.lastConnectedAt } : {}),
    ...(typeof value.lastReconnectAt === "string" ? { lastReconnectAt: value.lastReconnectAt } : {}),
    ...(typeof value.lastError === "string" ? { lastError: value.lastError } : {}),
  }
}

function sanitizeQueuedNotification(value: unknown, now: string): OpenCodeState["notificationQueue"][number] | undefined {
  if (!isRecord(value)) return undefined
  const status =
    value.status === "processing" || value.status === "done" || value.status === "failed" ? value.status : "pending"
  const entityUuid = typeof value.entityUuid === "string" && value.entityUuid.length > 0 ? value.entityUuid : undefined
  const projectUuid = typeof value.projectUuid === "string" && value.projectUuid.length > 0 ? value.projectUuid : undefined
  const actionHint = typeof value.actionHint === "string" && value.actionHint.length > 0 ? value.actionHint : undefined
  const notificationUuid =
    typeof value.notificationUuid === "string" && value.notificationUuid.length > 0
      ? value.notificationUuid
      : typeof value.id === "string" && value.id.length > 0
        ? value.id
        : undefined
  const kind = typeof value.kind === "string" && value.kind.length > 0 ? value.kind : undefined

  if (!notificationUuid || !kind) return undefined

  return {
    id: notificationUuid,
    notificationUuid,
    kind,
    delivery: value.delivery === "context_only" ? "context_only" : "assistant_turn",
    ...(entityUuid ? { entityUuid } : {}),
    ...(projectUuid ? { projectUuid } : {}),
    title: typeof value.title === "string" && value.title.length > 0 ? value.title : "Chorus notification",
    toastMessage:
      typeof value.toastMessage === "string" && value.toastMessage.length > 0
        ? value.toastMessage
        : `Chorus notification: ${kind}${entityUuid ? ` (${entityUuid})` : ""}`,
    prompt:
      typeof value.prompt === "string" && value.prompt.length > 0
        ? value.prompt
        : actionHint ?? `Review the Chorus notification for ${kind}${entityUuid ? ` on ${entityUuid}` : ""}.`,
    ...(actionHint ? { actionHint } : {}),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : typeof value.createdAt === "string" ? value.createdAt : now,
    attempts: typeof value.attempts === "number" && Number.isFinite(value.attempts) ? value.attempts : 0,
    status,
    ...(typeof value.lastError === "string" && value.lastError.length > 0 ? { lastError: value.lastError } : {}),
  }
}

export function migrateSharedState(input: unknown): SharedState {
  if (!input || typeof input !== "object") return createDefaultSharedState()
  const state = input as Partial<SharedState>
  return {
    ...createDefaultSharedState(),
    ...state,
    version: 1,
    context: state.context ?? {},
    orphanHints: state.orphanHints ?? [],
  }
}

function sanitizeProjectMetadata(value: unknown): ProjectStateMetadata | undefined {
  if (!isRecord(value)) return undefined
  if (
    typeof value.canonicalDirectory !== "string" ||
    typeof value.projectKey !== "string" ||
    typeof value.projectName !== "string" ||
    (value.stateMode !== "global" && value.stateMode !== "project")
  ) {
    return undefined
  }

  return {
    canonicalDirectory: value.canonicalDirectory,
    ...(typeof value.worktree === "string" ? { worktree: value.worktree } : {}),
    projectKey: value.projectKey,
    projectName: value.projectName,
    stateMode: value.stateMode,
    ...(typeof value.migratedFrom === "string" ? { migratedFrom: value.migratedFrom } : {}),
    ...(typeof value.migratedAt === "string" ? { migratedAt: value.migratedAt } : {}),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isSessionContextRecord(value: unknown): value is OpenCodeState["sessionContext"] {
  return (
    isRecord(value) &&
    value.source === "chorus_checkin" &&
    typeof value.runtimeSessionId === "string" &&
    typeof value.lastRefreshedAt === "string" &&
    Array.isArray(value.projects)
  )
}
