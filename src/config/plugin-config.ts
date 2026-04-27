import type { Config } from "@opencode-ai/plugin"
import { fileURLToPath } from "node:url"
import { applyReviewerAgentConfig } from "../reviewers/reviewer-agents"

const chorusSkillsDir = fileURLToPath(new URL("../../skills/", import.meta.url))

function normalizeSkillsPath(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "")
  return normalized === "" ? path : normalized
}

type ConfigWithSkills = Config & {
  skills?: {
    paths?: string[]
  }
}

export async function applyPluginConfig(config: Config): Promise<void> {
  const configWithSkills = config as ConfigWithSkills

  configWithSkills.skills = configWithSkills.skills ?? {}
  configWithSkills.skills.paths = configWithSkills.skills.paths ?? []

  const normalizedChorusSkillsDir = normalizeSkillsPath(chorusSkillsDir)
  const hasBundledSkillsDir = configWithSkills.skills.paths.some(
    (path) => normalizeSkillsPath(path) === normalizedChorusSkillsDir,
  )

  if (!hasBundledSkillsDir) {
    configWithSkills.skills.paths.push(chorusSkillsDir)
  }

  await applyReviewerAgentConfig(config)
}
