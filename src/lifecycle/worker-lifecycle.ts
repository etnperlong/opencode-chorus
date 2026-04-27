import type { StateStore } from "../state/state-store"

export async function cleanupOrphanWorkers(stateStore: StateStore) {
  await stateStore.updateOpenCodeState((state) => ({
    ...state,
    workers: Object.fromEntries(
      Object.entries(state.workers).map(([key, value]) => [
        key,
        value.status === "running" ? { ...value, status: "aborted", finishedAt: new Date().toISOString() } : value,
      ]),
    ),
  }))
}
