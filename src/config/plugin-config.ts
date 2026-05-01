import type { Config } from "@opencode-ai/plugin"
import { applyReviewerAgentConfig } from "../reviewers/reviewer-agents"
import { bundledSkillsDir } from "../util/package-resource-paths"

function normalizeSkillsPath(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "")
  return normalized === "" ? path : normalized
}

type ConfigWithPluginState = Config & {
  skills?: {
    paths?: string[]
  }
  mcp?: Record<string, unknown>
}

export function createPluginConfigApplier() {
  return async function applyPluginConfig(config: Config): Promise<void> {
    const configWithPluginState = config as ConfigWithPluginState

    configWithPluginState.skills = configWithPluginState.skills ?? {}
    configWithPluginState.skills.paths = configWithPluginState.skills.paths ?? []

    const normalizedChorusSkillsDir = normalizeSkillsPath(bundledSkillsDir)
    const hasBundledSkillsDir = configWithPluginState.skills.paths.some(
      (path) => normalizeSkillsPath(path) === normalizedChorusSkillsDir,
    )

    if (!hasBundledSkillsDir) {
      configWithPluginState.skills.paths.push(bundledSkillsDir)
    }

    await applyReviewerAgentConfig(config)
  }
}
