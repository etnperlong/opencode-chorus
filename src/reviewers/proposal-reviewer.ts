import type { ChorusMcpClient } from "../chorus/mcp-client"

export async function runProposalReviewer(
  chorusClient: ChorusMcpClient,
  targetUuid: string,
  content: string,
) {
  return chorusClient.callTool("chorus_add_comment", {
    targetType: "proposal",
    targetUuid,
    content,
  })
}
