export type PlanningScopeRecord = {
  id: string
  status: "open" | "closing" | "closed" | "aborted"
  source: "proposal" | "task" | "manual"
  createdAt: string
  closedAt?: string
  sessionId: string
  target?: {
    projectUuid?: string
    ideaUuid?: string
    proposalUuid?: string
    taskUuid?: string
  }
  todos: {
    proposalExists: boolean
    draftsReady: boolean
    documentDraftReady?: boolean
    taskDraftReady?: boolean
    dependenciesReady: boolean
    submittedOrApproved: boolean
  }
}

export type WorkerRecord = {
  kind: "main" | "worker" | "proposal-reviewer" | "task-reviewer"
  status: "running" | "completed" | "failed" | "aborted"
  runtimeSessionId: string
  chorusSessionUuid?: string
  targetType?: "idea" | "proposal" | "task"
  targetUuid?: string
  startedAt: string
  finishedAt?: string
}

export type ReviewRecord = {
  currentRound: number
  maxRounds: number
  status: "idle" | "reviewing" | "changes-requested" | "approved" | "escalated" | "timed-out" | "interrupted"
  lastVerdict?: "PASS" | "PASS_WITH_NOTES" | "FAIL"
  lastReviewJobId?: string
  lastReviewerComment?: string
  lastTargetSignature?: string
  lastGateStatus?: "completed" | "timeout" | "escalated" | "interrupted"
  lastGateMessage?: string
  blockersSnapshot: string[]
}

export type SessionContextRecord = {
  source: "chorus_checkin"
  runtimeSessionId: string
  lastRefreshedAt: string
  lastSurfacedAt?: string
  lastSurfacedRuntimeSessionId?: string
  agent?: {
    uuid?: string
    name?: string
    roles: string[]
  }
  owner?: {
    uuid?: string
    name?: string
  }
  projects: Array<{
    uuid: string
    name: string
    ideaCount?: number
    taskCount?: number
    pendingProposalCount?: number
  }>
  notifications?: {
    unread: number
  }
}

export type QueuedNotification = {
  id: string
  kind: string
  entityUuid?: string
  projectUuid?: string
  actionHint?: string
  createdAt: string
  status: "pending" | "processing" | "done" | "failed"
}

export type OpenCodeState = {
  version: 1
  runtime: "opencode"
  updatedAt: string
  mainSession: {
    runtimeSessionId?: string
    chorusSessionUuid?: string
    status: "idle" | "active" | "closed"
    lastHeartbeatAt?: string
  }
  planningScopes: Record<string, PlanningScopeRecord>
  workers: Record<string, WorkerRecord>
  reviews: Record<string, ReviewRecord>
  sessionContext?: SessionContextRecord
  lazyBridge?: LazyBridgeStatusRecord
  notificationQueue: QueuedNotification[]
  checkpoints: {
    lastUnreadBackfillAt?: string
    lastSharedSyncAt?: string
  }
}

export type LazyBridgeStatusRecord = {
  status: "idle" | "connecting" | "connected" | "stale" | "error"
  lastRefreshStartedAt?: string
  lastRefreshSucceededAt?: string
  lastRefreshFailedAt?: string
  toolCount?: number
  chorusUrl?: string
  agent?: {
    uuid?: string
    name?: string
    roles: string[]
  }
  scope?: {
    projectUuid?: string
    projectName?: string
    projectGroupUuid?: string
    projectGroupName?: string
  }
  lastError?: string
}

export type SharedState = {
  version: 1
  lastActiveRuntime?: string
  lastUpdatedAt?: string
  context: {
    projectUuid?: string
    ideaUuid?: string
    proposalUuid?: string
    taskUuid?: string
  }
  orphanHints: Array<{
    kind: string
    runtime: string
    id: string
    status: string
    updatedAt: string
  }>
}
