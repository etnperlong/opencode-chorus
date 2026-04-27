import { readFile } from "node:fs/promises"
import type { Config } from "@opencode-ai/plugin"

export const PROPOSAL_REVIEWER_AGENT = "proposal-reviewer"
export const TASK_REVIEWER_AGENT = "task-reviewer"
export const PROPOSAL_REVIEWER_MAX_STEPS = 20
export const TASK_REVIEWER_MAX_STEPS = 25

export async function applyReviewerAgentConfig(config: Config): Promise<void> {
  const [proposalPrompt, taskPrompt] = await Promise.all([
    readPrompt("proposal-reviewer.md"),
    readPrompt("task-reviewer.md"),
  ])

  config.agent = {
    ...config.agent,
    [PROPOSAL_REVIEWER_AGENT]: {
      ...config.agent?.[PROPOSAL_REVIEWER_AGENT],
      description: "Review submitted Chorus proposals for quality and post a Chorus VERDICT comment.",
      mode: "subagent",
      color: "#dc2626",
      maxSteps: PROPOSAL_REVIEWER_MAX_STEPS,
      prompt: proposalPrompt,
      permission: {
        ...config.agent?.[PROPOSAL_REVIEWER_AGENT]?.permission,
        edit: "deny",
        bash: "deny",
      },
    },
    [TASK_REVIEWER_AGENT]: {
      ...config.agent?.[TASK_REVIEWER_AGENT],
      description: "Review submitted Chorus tasks against acceptance criteria and post a Chorus VERDICT comment.",
      mode: "subagent",
      color: "#dc2626",
      maxSteps: TASK_REVIEWER_MAX_STEPS,
      prompt: taskPrompt,
      permission: {
        ...config.agent?.[TASK_REVIEWER_AGENT]?.permission,
        edit: "deny",
        bash: "ask",
      },
    },
  }
}

async function readPrompt(name: string): Promise<string> {
  return readFile(new URL(`../../prompts/${name}`, import.meta.url), "utf8")
}
