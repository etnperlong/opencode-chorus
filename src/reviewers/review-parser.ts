export type ReviewVerdict = "PASS" | "PASS_WITH_NOTES" | "FAIL"

export function parseVerdict(text: string): ReviewVerdict {
  if (text.match(/^VERDICT: PASS WITH NOTES$/m)) return "PASS_WITH_NOTES"
  if (text.match(/^VERDICT: PASS$/m)) return "PASS"
  if (text.match(/^VERDICT: FAIL$/m)) return "FAIL"
  if (text.includes("VERDICT:")) throw new Error("Reviewer output has unsupported VERDICT line")
  throw new Error("Reviewer output missing VERDICT line")
}
