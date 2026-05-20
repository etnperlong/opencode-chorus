import type { ProjectStateMetadata } from "./paths"

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

export type AgentPermissionsRecord = Record<string, boolean | string[]>

export type SessionContextAgentRecord = {
  uuid?: string
  name?: string
  permissions?: string[] | AgentPermissionsRecord
  /** Deprecated: Chorus v0.8+ no longer returns roles in checkin responses. */
  roles?: string[]
}

export type SessionContextRecord = {
  source: "chorus_checkin"
  runtimeSessionId: string
  lastRefreshedAt: string
  lastSurfacedAt?: string
  lastSurfacedRuntimeSessionId?: string
  agent?: SessionContextAgentRecord
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
  notificationUuid: string
  kind: string
  delivery: "assistant_turn" | "context_only"
  entityUuid?: string
  projectUuid?: string
  title: string
  toastMessage: string
  prompt: string
  actionHint?: string
  createdAt: string
  updatedAt: string
  attempts: number
  status: "pending" | "processing" | "done" | "failed"
  lastError?: string
}

export type NotificationRuntimeRecord = {
  status: "idle" | "connecting" | "connected" | "reconnecting" | "disconnected" | "error"
  lastEventAt?: string
  lastConnectedAt?: string
  lastReconnectAt?: string
  lastError?: string
  lastScopeEvaluation?: {
    notificationUuid: string
    outcome: "in_scope" | "out_of_scope" | "unresolved"
    source: "config" | "shared" | "session" | "unresolved"
    reason:
      | "project_allowed"
      | "project_not_in_scope"
      | "missing_notification_project"
      | "multiple_session_projects"
      | "missing_scope_context"
    notificationProjectUuid?: string
    scopeProjectUuids: string[]
    recordedAt: string
  }
}

export type OpenCodeState = {
  version: 1
  runtime: "opencode"
  updatedAt: string
  project?: ProjectStateMetadata
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
  chorusReadiness?: ChorusReadinessRecord
  lazyBridge?: LazyBridgeStatusRecord
  notificationRuntime?: NotificationRuntimeRecord
  notificationQueue: QueuedNotification[]
  checkpoints: {
    lastUnreadBackfillAt?: string
    lastNotificationCreatedAt?: string
    lastSharedSyncAt?: string
  }
}

export type ChorusReadinessRecord = {
  sessionId: string
  status: "ready" | "error"
  agentName?: string
  openSpecAvailable?: boolean
  lastReadyAt?: string
  lastError?: string
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
