import { tool } from "@opencode-ai/plugin"
import type { ChorusMcpClient } from "../mcp-client"

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

export function createPmTools(chorusClient: ChorusMcpClient) {
  return {
    chorus_create_proposal: tool({
      description: "Create a Chorus proposal draft.",
      args: {
        projectUuid: tool.schema.string(),
        title: tool.schema.string(),
        summary: tool.schema.string(),
      },
      execute: async (args) => prettyJson(await chorusClient.callTool("chorus_create_proposal", args)),
    }),
    chorus_add_document_draft: tool({
      description: "Add a document draft to a Chorus proposal.",
      args: {
        proposalUuid: tool.schema.string(),
        title: tool.schema.string(),
        content: tool.schema.string(),
      },
      execute: async (args) => prettyJson(await chorusClient.callTool("chorus_add_document_draft", args)),
    }),
    chorus_add_task_draft: tool({
      description: "Add a task draft to a Chorus proposal.",
      args: {
        proposalUuid: tool.schema.string(),
        title: tool.schema.string(),
        description: tool.schema.string(),
        acceptanceCriteria: tool.schema.string(),
      },
      execute: async (args) => prettyJson(await chorusClient.callTool("chorus_add_task_draft", args)),
    }),
    chorus_update_task_draft: tool({
      description: "Update a Chorus task draft, including dependency information.",
      args: {
        taskDraftUuid: tool.schema.string(),
        title: tool.schema.string(),
        description: tool.schema.string(),
        acceptanceCriteria: tool.schema.string(),
        dependencies: tool.schema.string(),
      },
      execute: async (args) => prettyJson(await chorusClient.callTool("chorus_update_task_draft", args)),
    }),
    chorus_pm_submit_proposal: tool({
      description: "Submit a Chorus proposal for approval.",
      args: {
        proposalUuid: tool.schema.string(),
      },
      execute: async (args) => prettyJson(await chorusClient.callTool("chorus_pm_submit_proposal", args)),
    }),
  }
}
