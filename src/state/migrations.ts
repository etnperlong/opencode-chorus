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
  return {
    ...createDefaultOpenCodeState(),
    ...state,
    version: 1,
    runtime: "opencode",
    planningScopes: state.planningScopes ?? {},
    workers: state.workers ?? {},
    reviews: state.reviews ?? {},
    sessionContext: isSessionContextRecord(state.sessionContext) ? state.sessionContext : undefined,
    notificationQueue: state.notificationQueue ?? [],
    checkpoints: state.checkpoints ?? {},
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
