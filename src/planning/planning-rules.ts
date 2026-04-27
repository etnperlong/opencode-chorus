export type PlanningTodoFlags = {
  proposalExists: boolean
  draftsReady: boolean
  documentDraftReady?: boolean
  taskDraftReady?: boolean
  dependenciesReady: boolean
  submittedOrApproved: boolean
}

export function canClosePlanningScope(flags: PlanningTodoFlags): boolean {
  return flags.proposalExists && areDraftsReady(flags) && flags.dependenciesReady && flags.submittedOrApproved
}

export function resolvePlanningSessionId(
  toolSessionId: string | undefined,
  mainSessionId: string | undefined,
  fallbackSessionId: string,
): string {
  return toolSessionId || mainSessionId || fallbackSessionId
}

function areDraftsReady(flags: PlanningTodoFlags): boolean {
  if (flags.documentDraftReady === undefined && flags.taskDraftReady === undefined) return flags.draftsReady
  return flags.draftsReady && flags.documentDraftReady === true && flags.taskDraftReady === true
}
