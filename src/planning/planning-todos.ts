export type PlanningTodo = {
  content: string
  priority: "high"
  status: "in_progress" | "pending"
}

export function buildPlanningTodos(): PlanningTodo[] {
  return [
    {
      content: "Create or identify Chorus proposal",
      priority: "high",
      status: "in_progress",
    },
    {
      content: "Prepare document and task drafts",
      priority: "high",
      status: "pending",
    },
    {
      content: "Set task dependency DAG",
      priority: "high",
      status: "pending",
    },
    {
      content: "Submit proposal or confirm approved-task path",
      priority: "high",
      status: "pending",
    },
  ]
}
