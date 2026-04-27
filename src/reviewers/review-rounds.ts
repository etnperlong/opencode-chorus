import type { OpenCodeState, ReviewRecord } from "../state/state-types"

export function nextReviewRound(state: OpenCodeState, targetKey: string, maxRounds: number): ReviewRecord {
  const existing = state.reviews[targetKey]
  const currentRound = (existing?.currentRound ?? 0) + 1

  return {
    currentRound,
    maxRounds,
    status: currentRound > maxRounds ? "escalated" : "reviewing",
    lastVerdict: existing?.lastVerdict,
    lastReviewJobId: existing?.lastReviewJobId,
    blockersSnapshot: existing?.blockersSnapshot ?? [],
  }
}
