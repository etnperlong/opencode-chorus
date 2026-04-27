export type ReviewVerdict = "PASS" | "PASS_WITH_NOTES" | "FAIL"

export function parseVerdict(text: string): ReviewVerdict {
  if (text.includes("VERDICT: PASS WITH NOTES")) return "PASS_WITH_NOTES"
  if (text.includes("VERDICT: PASS")) return "PASS"
  if (text.includes("VERDICT: FAIL")) return "FAIL"
  throw new Error("Reviewer output missing VERDICT line")
}
