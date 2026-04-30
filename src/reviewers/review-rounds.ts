import type { OpenCodeState, ReviewRecord } from "../state/state-types"

export function nextReviewRound(
  state: OpenCodeState,
  targetKey: string,
  maxRounds: number,
  targetSignature?: string,
): ReviewRecord {
  const existing = state.reviews[targetKey]
  if (existing && shouldReuseExistingReview(existing, targetSignature)) return existing

  const currentRound = (existing?.currentRound ?? 0) + 1
  const status = currentRound > maxRounds ? "escalated" : "reviewing"
  const isEscalated = status === "escalated"

  return {
    currentRound,
    maxRounds,
    status,
    lastVerdict: isEscalated ? existing?.lastVerdict : undefined,
    lastReviewJobId: isEscalated ? existing?.lastReviewJobId : undefined,
    lastReviewerComment: isEscalated ? existing?.lastReviewerComment : undefined,
    lastTargetSignature: targetSignature,
    lastGateStatus: isEscalated ? "escalated" : undefined,
    lastGateMessage: isEscalated ? "Maximum reviewer rounds exceeded; escalate for human review" : undefined,
    blockersSnapshot: existing?.blockersSnapshot ?? [],
  }
}

function shouldReuseExistingReview(existing: ReviewRecord, targetSignature?: string): boolean {
  if (!targetSignature) return false
  if (existing.lastTargetSignature !== targetSignature) return false
  return existing.status !== "timed-out" && existing.status !== "interrupted"
}
