import type { OpenCodeState, ReviewRecord } from "../state/state-types"

export function nextReviewRound(state: OpenCodeState, targetKey: string, maxRounds: number): ReviewRecord {
  const existing = state.reviews[targetKey]
  const currentRound = (existing?.currentRound ?? 0) + 1
  const status = currentRound > maxRounds ? "escalated" : "reviewing"

  return {
    currentRound,
    maxRounds,
    status,
    lastVerdict: status === "escalated" ? existing?.lastVerdict : undefined,
    lastReviewJobId: status === "escalated" ? existing?.lastReviewJobId : undefined,
    blockersSnapshot: existing?.blockersSnapshot ?? [],
  }
}
