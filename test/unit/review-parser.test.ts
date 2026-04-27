import { describe, expect, it } from "bun:test"
import { parseVerdict } from "../../src/reviewers/review-parser"

describe("parseVerdict", () => {
  it("parses PASS WITH NOTES", () => {
    expect(parseVerdict("Summary\nVERDICT: PASS WITH NOTES")).toBe("PASS_WITH_NOTES")
  })
})
