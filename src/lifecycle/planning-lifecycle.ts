import { randomUUID } from "node:crypto"
import { canClosePlanningScope, type PlanningTodoFlags } from "../planning/planning-rules"
import type { StateStore } from "../state/state-store"

const openPlanningTodos: PlanningTodoFlags = {
  proposalExists: false,
  draftsReady: false,
  documentDraftReady: false,
  taskDraftReady: false,
  dependenciesReady: false,
  submittedOrApproved: false,
}

export class PlanningLifecycle {
  constructor(private readonly stateStore: StateStore) {}

  async ensureScope(sessionId: string): Promise<void> {
    await this.stateStore.updateOpenCodeState((state) => {
      if (state.planningScopes[sessionId]) return state

      return {
        ...state,
        planningScopes: {
          ...state.planningScopes,
          [sessionId]: {
            id: randomUUID(),
            status: "open",
            source: "proposal",
            createdAt: new Date().toISOString(),
            sessionId,
            todos: { ...openPlanningTodos },
          },
        },
      }
    })
  }

  async markTodo(sessionId: string, patch: Partial<PlanningTodoFlags>): Promise<void> {
    await this.ensureScope(sessionId)
    await this.stateStore.updateOpenCodeState((state) => {
      const scope = state.planningScopes[sessionId]
      if (!scope) return state

      const todos = normalizeDraftTodos({ ...scope.todos, ...patch })
      const shouldClose = canClosePlanningScope(todos)

      return {
        ...state,
        planningScopes: {
          ...state.planningScopes,
          [sessionId]: {
            ...scope,
            status: shouldClose ? "closed" : scope.status,
            closedAt: shouldClose ? (scope.closedAt ?? new Date().toISOString()) : scope.closedAt,
            todos,
          },
        },
      }
    })
  }
}

function normalizeDraftTodos(todos: PlanningTodoFlags): PlanningTodoFlags {
  const documentDraftReady = todos.documentDraftReady ?? false
  const taskDraftReady = todos.taskDraftReady ?? false
  return {
    ...todos,
    documentDraftReady,
    taskDraftReady,
    draftsReady: documentDraftReady && taskDraftReady,
  }
}
