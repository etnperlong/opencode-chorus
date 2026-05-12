import type { OpenCodeState, SharedState } from "./state-types"

export function createDefaultOpenCodeState(): OpenCodeState {
  return {
    version: 1,
    runtime: "opencode",
    updatedAt: new Date().toISOString(),
    mainSession: { status: "idle" },
    planningScopes: {},
    workers: {},
    reviews: {},
    notificationQueue: [],
    checkpoints: {},
  }
}

export function createDefaultSharedState(): SharedState {
  return {
    version: 1,
    context: {},
    orphanHints: [],
  }
}

export function migrateOpenCodeState(input: unknown): OpenCodeState {
  if (!input || typeof input !== "object") return createDefaultOpenCodeState()
  const state = input as Partial<OpenCodeState>
  const now = new Date().toISOString()
  return {
    ...createDefaultOpenCodeState(),
    ...state,
    version: 1,
    runtime: "opencode",
    planningScopes: state.planningScopes ?? {},
    workers: state.workers ?? {},
    reviews: state.reviews ?? {},
    sessionContext: isSessionContextRecord(state.sessionContext) ? state.sessionContext : undefined,
    lazyBridge: isLazyBridgeStatusRecord(state.lazyBridge) ? sanitizeLazyBridgeStatus(state.lazyBridge) : undefined,
    notificationRuntime: isNotificationRuntimeRecord(state.notificationRuntime)
      ? sanitizeNotificationRuntime(state.notificationRuntime)
      : undefined,
    notificationQueue: Array.isArray(state.notificationQueue)
      ? state.notificationQueue
          .map((item) => sanitizeQueuedNotification(item, now))
          .filter((item): item is NonNullable<typeof item> => item !== undefined)
      : [],
    checkpoints: state.checkpoints ?? {},
  }
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
