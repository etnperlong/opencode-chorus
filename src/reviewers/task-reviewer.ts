import type { ChorusMcpClient } from "../chorus/mcp-client"

export async function runTaskReviewer(
  chorusClient: ChorusMcpClient,
  targetUuid: string,
  content: string,
) {
  return chorusClient.callTool("chorus_add_comment", {
    targetType: "task",
    targetUuid,
    content,
  })
}
