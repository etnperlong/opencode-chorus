import { markInterruptedReviews } from "../lifecycle/reviewer-lifecycle"
import { extractSessionEventId, shouldReplaceMainSessionOnStartup, shouldStartMainSession } from "../lifecycle/session-events"
import type { SessionLifecycle } from "../lifecycle/session-lifecycle"
import { cleanupOrphanWorkers } from "../lifecycle/worker-lifecycle"
import type { StateStore } from "../state/state-store"
import type { Logger } from "../util/logger"

type PluginEventPayload = {
  event: {
    type: string
    properties?: unknown
  }
}

type CreatePluginEventHookOptions = {
  autoStart: boolean
  enableSessionContextSummary: boolean
  stateStore: StateStore
  sessionLifecycle: SessionLifecycle
  logger: Pick<Logger, "debug" | "info">
}

export function createPluginEventHook(options: CreatePluginEventHookOptions) {
  let hasHandledSessionStartup = false

  return async ({ event }: PluginEventPayload): Promise<void> => {
    await options.logger.debug("Observed OpenCode event", { type: event.type })

    if (event.type === "session.created" || (event.type === "session.updated" && !hasHandledSessionStartup)) {
      const sessionId = extractSessionEventId(event)
      if (sessionId) {
        const state = await options.stateStore.readOpenCodeState()
        const replaceExisting = shouldReplaceMainSessionOnStartup(
          state.mainSession,
          sessionId,
          hasHandledSessionStartup,
        )
        if (
          options.autoStart &&
          (replaceExisting || shouldStartMainSession(state.mainSession.runtimeSessionId, sessionId))
        ) {
          await cleanupOrphanWorkers(options.stateStore)
          await markInterruptedReviews(options.stateStore)
          await options.sessionLifecycle.start(sessionId, { replaceExisting })
          if (options.enableSessionContextSummary) {
            await options.sessionLifecycle.surfaceContextSummary(sessionId, options.logger)
          }
        }
        hasHandledSessionStartup = true
      }
    }

    if (event.type === "session.idle") {
      const sessionId = extractSessionEventId(event)
      if (sessionId) await options.sessionLifecycle.heartbeat(sessionId)
    }

    if (event.type === "session.deleted") {
      const sessionId = extractSessionEventId(event)
      if (sessionId) await options.sessionLifecycle.stop(sessionId)
    }
  }
}
