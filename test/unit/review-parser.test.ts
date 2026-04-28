import { describe, expect, it } from "bun:test"
import { parseVerdict } from "../../src/reviewers/review-parser"

describe("parseVerdict", () => {
  it("parses PASS", () => {
    expect(parseVerdict("Summary\nVERDICT: PASS")).toBe("PASS")
  })

  it("parses PASS WITH NOTES", () => {
    expect(parseVerdict("Summary\nVERDICT: PASS WITH NOTES")).toBe("PASS_WITH_NOTES")
  })

  it("parses FAIL", () => {
    expect(parseVerdict("Summary\nVERDICT: FAIL")).toBe("FAIL")
  })

  it("rejects missing verdicts", () => {
    expect(() => parseVerdict("Summary without a verdict")).toThrow("Reviewer output missing VERDICT line")
  })

  it("rejects unsupported verdicts", () => {
    expect(() => parseVerdict("Summary\nVERDICT: MAYBE")).toThrow("Reviewer output has unsupported VERDICT line")
  })

  it("rejects verdicts that only prefix a supported verdict", () => {
    expect(() => parseVerdict("Summary\nVERDICT: PASSING")).toThrow("Reviewer output has unsupported VERDICT line")
    expect(() => parseVerdict("Summary\nVERDICT: FAILED")).toThrow("Reviewer output has unsupported VERDICT line")
    expect(() => parseVerdict("Summary\nVERDICT: PASS WITH NOTES PLEASE")).toThrow(
      "Reviewer output has unsupported VERDICT line",
    )
  })
})
