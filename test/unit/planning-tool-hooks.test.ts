import { describe, expect, it } from "bun:test"
import { normalizeChorusToolName, planningPatchForTool } from "../../src/planning/planning-tool-hooks"

describe("planning tool hooks", () => {
  it("normalizes double-prefixed native Chorus tool names", () => {
    expect(normalizeChorusToolName("chorus_chorus_add_comment")).toBe("chorus_add_comment")
  })

  it("keeps already-normalized tool names unchanged", () => {
    expect(normalizeChorusToolName("chorus_add_comment")).toBe("chorus_add_comment")
  })

  it("maps planning tools to todo patches", () => {
    expect(planningPatchForTool("chorus_create_proposal")).toEqual({ proposalExists: true })
    expect(planningPatchForTool("chorus_add_document_draft")).toEqual({ documentDraftReady: true })
    expect(planningPatchForTool("chorus_add_task_draft")).toEqual({ taskDraftReady: true })
    expect(planningPatchForTool("chorus_update_task_draft")).toEqual({ dependenciesReady: true })
    expect(planningPatchForTool("chorus_pm_submit_proposal")).toEqual({ submittedOrApproved: true })
  })

  it("returns undefined for non-planning tools", () => {
    expect(planningPatchForTool("chorus_add_comment")).toBeUndefined()
  })
})
