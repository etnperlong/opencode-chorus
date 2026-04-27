import { describe, expect, it } from "bun:test"
import { canClosePlanningScope, resolvePlanningSessionId } from "../../src/planning/planning-rules"

describe("canClosePlanningScope", () => {
  it("closes when all proposal todos are complete", () => {
    expect(
      canClosePlanningScope({
        proposalExists: true,
        draftsReady: true,
        dependenciesReady: true,
        submittedOrApproved: true,
      }),
    ).toBe(true)
  })

  it("stays open when only one draft type is complete", () => {
    expect(
      canClosePlanningScope({
        proposalExists: true,
        draftsReady: true,
        documentDraftReady: true,
        taskDraftReady: false,
        dependenciesReady: true,
        submittedOrApproved: true,
      }),
    ).toBe(false)
  })
})

describe("resolvePlanningSessionId", () => {
  it("uses the tool execution session before the main session", () => {
    expect(resolvePlanningSessionId("tool-session", "main-session", "fallback-session")).toBe("tool-session")
  })
})
