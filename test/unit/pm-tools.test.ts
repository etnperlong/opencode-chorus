import { describe, expect, it } from "bun:test"
import { createPmTools } from "../../src/chorus/tool-groups/pm-tools"

describe("createPmTools", () => {
  it("wraps planning MCP tools with pretty JSON responses", async () => {
    const chorusClient = new FakeChorusClient()
    const tools = createPmTools(chorusClient as never)

    const output = await tools.chorus_create_proposal.execute(
      {
        projectUuid: "project-1",
        title: "Proposal title",
        summary: "Proposal summary",
      } as never,
      {} as never,
    )

    expect(chorusClient.calls).toEqual([
      {
        name: "chorus_create_proposal",
        args: {
          projectUuid: "project-1",
          title: "Proposal title",
          summary: "Proposal summary",
        },
      },
    ])
    expect(output).toBe(JSON.stringify({ proposalUuid: "proposal-1" }, null, 2))
  })
})

class FakeChorusClient {
  calls: Array<{ name: string; args: Record<string, unknown> }> = []

  async callTool(name: string, args: Record<string, unknown>) {
    this.calls.push({ name, args })
    return { proposalUuid: "proposal-1" }
  }
}
