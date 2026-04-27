import type { PlanningTodoFlags } from "./planning-rules"

export function planningPatchForTool(tool: string): Partial<PlanningTodoFlags> | undefined {
  if (tool === "chorus_create_proposal") return { proposalExists: true }
  if (tool === "chorus_add_document_draft") return { documentDraftReady: true }
  if (tool === "chorus_add_task_draft") return { taskDraftReady: true }
  if (tool === "chorus_update_task_draft") return { dependenciesReady: true }
  if (tool === "chorus_pm_submit_proposal") return { submittedOrApproved: true }
}

export function normalizeChorusToolName(tool: string): string {
  const nativePrefix = "chorus_chorus_"
  if (tool.startsWith(nativePrefix)) return tool.slice("chorus_".length)
  return tool
}
