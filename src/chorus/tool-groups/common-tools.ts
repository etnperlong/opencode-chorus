import { tool } from "@opencode-ai/plugin"
import type { ChorusMcpClient } from "../mcp-client"

export function createCommonTools(chorusClient: ChorusMcpClient) {
  return {
    chorus_checkin: tool({
      description: "Check in with Chorus and get current project status.",
      args: {},
      execute: async () => JSON.stringify(await chorusClient.callTool("chorus_checkin")),
    }),
    chorus_get_task: tool({
      description: "Get details for a Chorus task.",
      args: {
        taskUuid: tool.schema.string(),
      },
      execute: async ({ taskUuid }) => JSON.stringify(await chorusClient.callTool("chorus_get_task", { taskUuid })),
    }),
  }
}
