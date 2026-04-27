import { tool } from "@opencode-ai/plugin"
import type { ChorusMcpClient } from "../mcp-client"

export function createDevTools(chorusClient: ChorusMcpClient) {
  return {
    chorus_claim_task: tool({
      description: "Claim a Chorus task for implementation.",
      args: {
        taskUuid: tool.schema.string(),
      },
      execute: async ({ taskUuid }) => JSON.stringify(await chorusClient.callTool("chorus_claim_task", { taskUuid })),
    }),
    chorus_submit_for_verify: tool({
      description: "Submit a completed Chorus task for verification.",
      args: {
        taskUuid: tool.schema.string(),
        summary: tool.schema.string(),
      },
      execute: async ({ taskUuid, summary }) =>
        JSON.stringify(await chorusClient.callTool("chorus_submit_for_verify", { taskUuid, summary })),
    }),
  }
}
