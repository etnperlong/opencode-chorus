import type { OpenCodeState, ReviewRecord } from "../state/state-types"

export function nextReviewRound(state: OpenCodeState, targetKey: string, maxRounds: number): ReviewRecord {
  const existing = state.reviews[targetKey]
  const currentRound = (existing?.currentRound ?? 0) + 1
  const status = currentRound > maxRounds ? "escalated" : "reviewing"
  const isEscalated = status === "escalated"

  return {
    currentRound,
    maxRounds,
    status,
    lastVerdict: isEscalated ? existing?.lastVerdict : undefined,
    lastReviewJobId: isEscalated ? existing?.lastReviewJobId : undefined,
    lastGateStatus: isEscalated ? "escalated" : undefined,
    lastGateMessage: isEscalated ? "Maximum reviewer rounds exceeded; escalate for human review" : undefined,
    blockersSnapshot: existing?.blockersSnapshot ?? [],
  }
}
