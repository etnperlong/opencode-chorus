import type { StateStore } from "../state/state-store"
import type { ReviewRecord } from "../state/state-types"
import type { ReviewVerdict } from "./review-parser"
import { nextReviewRound } from "./review-rounds"

export async function beginReviewRound(
  stateStore: StateStore,
  targetKey: string,
  maxRounds: number,
  targetSignature?: string,
): Promise<ReviewRecord> {
  let nextReview: ReviewRecord | undefined

  await stateStore.updateOpenCodeState((state) => {
    const review = nextReviewRound(state, targetKey, maxRounds, targetSignature)
    nextReview = review

    return {
      ...state,
      reviews: {
        ...state.reviews,
        [targetKey]: review,
      },
    }
  })

  if (!nextReview) throw new Error("Review round was not persisted")
  return nextReview
}

export async function persistReviewVerdict(
  stateStore: StateStore,
  targetKey: string,
  verdict: ReviewVerdict,
  options: { expectedReviewJobId?: string; reviewerComment?: string } = {},
): Promise<boolean> {
  let persisted = false

  await stateStore.updateOpenCodeState((state) => {
    const existing = state.reviews[targetKey]
    if (existing?.status === "escalated") return state
    if (options.expectedReviewJobId && existing?.lastReviewJobId !== options.expectedReviewJobId) return state

    persisted = true

    return {
      ...state,
      reviews: {
        ...state.reviews,
        [targetKey]: {
          currentRound: existing?.currentRound ?? 1,
          maxRounds: existing?.maxRounds ?? 1,
          status: verdict === "FAIL" ? "changes-requested" : "approved",
          lastVerdict: verdict,
          lastReviewJobId: existing?.lastReviewJobId,
          lastReviewerComment: options.reviewerComment ?? existing?.lastReviewerComment,
          lastTargetSignature: existing?.lastTargetSignature,
          lastGateStatus: "completed",
          lastGateMessage: `Reviewer completed with verdict ${verdict}`,
          blockersSnapshot: existing?.blockersSnapshot ?? [],
        },
      },
    }
  })

  return persisted
}

export async function persistReviewTimeout(
  stateStore: StateStore,
  targetKey: string,
  options: { expectedReviewJobId?: string } = {},
): Promise<boolean> {
  let persisted = false

  await stateStore.updateOpenCodeState((state) => {
    const existing = state.reviews[targetKey]
    if (!existing || existing.status !== "reviewing") return state
    if (options.expectedReviewJobId && existing.lastReviewJobId !== options.expectedReviewJobId) return state

    persisted = true

    return {
      ...state,
      reviews: {
        ...state.reviews,
        [targetKey]: {
          ...existing,
          status: "timed-out",
          lastGateStatus: "timeout",
          lastGateMessage: "Reviewer did not finish before timeout",
        },
      },
    }
  })

  return persisted
}

export async function persistReviewJobId(
  stateStore: StateStore,
  targetKey: string,
  jobId: string,
  options: { expectedRound?: number } = {},
): Promise<boolean> {
  let persisted = false

  await stateStore.updateOpenCodeState((state) => {
    const existing = state.reviews[targetKey]
    if (!existing) return state
    if (options.expectedRound !== undefined && existing.currentRound !== options.expectedRound) return state
    if (options.expectedRound !== undefined && existing.status !== "reviewing") return state

    persisted = true

    return {
      ...state,
      reviews: {
        ...state.reviews,
        [targetKey]: {
          ...existing,
          lastReviewJobId: jobId,
        },
      },
    }
  })

  return persisted
}
