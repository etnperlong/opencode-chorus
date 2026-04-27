import type { StateStore } from "../state/state-store"
import type { ReviewRecord } from "../state/state-types"
import type { ReviewVerdict } from "./review-parser"
import { nextReviewRound } from "./review-rounds"

export async function beginReviewRound(stateStore: StateStore, targetKey: string, maxRounds: number): Promise<ReviewRecord> {
  let nextReview: ReviewRecord | undefined

  await stateStore.updateOpenCodeState((state) => {
    const review = nextReviewRound(state, targetKey, maxRounds)
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
) {
  return stateStore.updateOpenCodeState((state) => {
    const existing = state.reviews[targetKey]
    if (existing?.status === "escalated") return state

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
          blockersSnapshot: existing?.blockersSnapshot ?? [],
        },
      },
    }
  })
}
