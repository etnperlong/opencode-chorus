import type { StateStore } from "../state/state-store"

export async function markInterruptedReviews(stateStore: StateStore) {
  await stateStore.updateOpenCodeState((state) => ({
    ...state,
    reviews: Object.fromEntries(
      Object.entries(state.reviews).map(([key, value]) => [
        key,
        value.status === "reviewing" ? { ...value, status: "changes-requested" } : value,
      ]),
    ),
  }))
}
