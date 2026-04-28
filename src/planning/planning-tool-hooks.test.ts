import { describe, expect, it } from "bun:test"

import { normalizeChorusToolName, planningPatchForTool } from "./planning-tool-hooks"

describe("planning tool hooks", () => {
  it("normalizes native Chorus MCP tool names", () => {
    expect(normalizeChorusToolName("chorus_chorus_pm_add_task_draft")).toBe(
      "chorus_pm_add_task_draft",
    )
  })

  it("tracks modern PM planning tools", () => {
    expect(planningPatchForTool("chorus_pm_create_proposal")).toEqual({
      proposalExists: true,
    })
    expect(planningPatchForTool("chorus_pm_add_document_draft")).toEqual({
      documentDraftReady: true,
    })
    expect(planningPatchForTool("chorus_pm_add_task_draft")).toEqual({
      taskDraftReady: true,
    })
    expect(planningPatchForTool("chorus_pm_update_task_draft")).toEqual({
      dependenciesReady: true,
    })
    expect(planningPatchForTool("chorus_pm_submit_proposal")).toEqual({
      submittedOrApproved: true,
    })
  })

  it("keeps backward compatibility with legacy non-pm names", () => {
    expect(planningPatchForTool("chorus_create_proposal")).toEqual({
      proposalExists: true,
    })
    expect(planningPatchForTool("chorus_add_document_draft")).toEqual({
      documentDraftReady: true,
    })
    expect(planningPatchForTool("chorus_add_task_draft")).toEqual({
      taskDraftReady: true,
    })
    expect(planningPatchForTool("chorus_update_task_draft")).toEqual({
      dependenciesReady: true,
    })
  })
})
