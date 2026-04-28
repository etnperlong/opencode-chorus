import type { Config } from "@opencode-ai/plugin"
import { createChorusRemoteMcpConfig } from "../chorus/mcp-config"
import { applyReviewerAgentConfig } from "../reviewers/reviewer-agents"
import { bundledSkillsDir } from "../util/package-resource-paths"
import type { OpenCodeChorusConfig } from "./schema"

function normalizeSkillsPath(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "")
  return normalized === "" ? path : normalized
}

type RuntimeMcpInput = Pick<OpenCodeChorusConfig, "chorusUrl" | "apiKey">

type ConfigWithPluginState = Config & {
  skills?: {
    paths?: string[]
  }
  mcp?: Record<string, unknown>
}

export function createPluginConfigApplier(runtimeMcp?: RuntimeMcpInput) {
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

    if (runtimeMcp) {
      configWithPluginState.mcp = configWithPluginState.mcp ?? {}
      if (configWithPluginState.mcp.chorus === undefined) {
        configWithPluginState.mcp.chorus = createChorusRemoteMcpConfig(runtimeMcp.chorusUrl, runtimeMcp.apiKey)
      }
    }

    await applyReviewerAgentConfig(config)
  }
}
