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
  status: "idle" | "reviewing" | "changes-requested" | "approved" | "escalated"
  lastVerdict?: "PASS" | "PASS_WITH_NOTES" | "FAIL"
  lastReviewJobId?: string
  blockersSnapshot: string[]
}

export type QueuedNotification = {
  id: string
  kind: string
  entityUuid?: string
  projectUuid?: string
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
  notificationQueue: QueuedNotification[]
  checkpoints: {
    lastUnreadBackfillAt?: string
    lastSharedSyncAt?: string
  }
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
