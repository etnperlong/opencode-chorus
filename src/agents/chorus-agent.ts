import type { Config } from "@opencode-ai/plugin"
import { readBundledPrompt } from "../util/package-resource-paths"

export const CHORUS_AGENT = "chorus"

export async function applyChorusAgentConfig(config: Config): Promise<void> {
  const prompt = await readBundledPrompt("chorus-agent.md")

  config.agent = {
    ...config.agent,
    [CHORUS_AGENT]: {
      ...config.agent?.[CHORUS_AGENT],
      description: "Run Chorus workflows with guided tool usage, skill routing, and lifecycle rules.",
      mode: "all",
      color: "#8b5cf6",
      prompt,
    },
  }
}
