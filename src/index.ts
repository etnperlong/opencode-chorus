import type { Plugin } from "@opencode-ai/plugin"
import { ChorusMcpClient } from "./chorus/mcp-client"
import { loadChorusConfig } from "./config/config-loader"
import { isMissingRequiredConfigError } from "./config/error-guards"
import { createPluginConfigApplier } from "./config/plugin-config"
import { createPluginEventHook } from "./hooks/plugin-event-hook"
import { createToolExecuteAfterHook } from "./hooks/tool-execute-after-hook"
import { PlanningLifecycle } from "./lifecycle/planning-lifecycle"
import { SessionLifecycle } from "./lifecycle/session-lifecycle"
import { enqueueRoutedNotification } from "./notifications/notification-dispatcher"
import { fetchUnreadNotificationByUuid } from "./notifications/notification-pagination"
import { routeNotification } from "./notifications/notification-router"
import { ChorusSseListener, type SseNotificationEvent } from "./notifications/sse-listener"
import { StateStore } from "./state/state-store"
import { formatError } from "./util/error-utils"
import { createLogger } from "./util/logger"

export const createPlugin: Plugin = async (ctx, options) => {
  const logger = createLogger(ctx.client)
  let loadedConfig
  try {
    loadedConfig = await loadChorusConfig(options ?? {})
  } catch (error) {
    if (isMissingRequiredConfigError(error)) {
      return {
        config: createPluginConfigApplier(),
      }
    }
    throw error
  }
  const config = loadedConfig.config
  const applyPluginConfig = createPluginConfigApplier({
    chorusUrl: config.chorusUrl,
    apiKey: config.apiKey,
  })
  const stateStore = new StateStore(ctx.directory, config.stateDir)
  await stateStore.init()
  const chorusClient = new ChorusMcpClient({
    chorusUrl: config.chorusUrl,
    apiKey: config.apiKey,
  })
  const sessionLifecycle = new SessionLifecycle(stateStore, chorusClient, config.chorusUrl)
  const planningLifecycle = new PlanningLifecycle(stateStore)
  const eventHook = createPluginEventHook({
    autoStart: config.autoStart,
    enableSessionContextSummary: config.enableSessionContextSummary,
    stateStore,
    sessionLifecycle,
    logger,
  })
  const toolExecuteAfterHook = createToolExecuteAfterHook({
    config,
    stateStore,
    planningLifecycle,
    context: {
      client: ctx.client,
      directory: ctx.directory,
    },
    chorusClient,
  })
  const notificationListener = new ChorusSseListener(config.chorusUrl, config.apiKey, (event) => {
    void handleNotificationEvent(event).catch((error) =>
      logger.error("Failed to process Chorus notification event", { error: formatError(error) }),
    )
  })

  if (loadedConfig.metadata.apiKeySource === "chorus.json") {
    await logger.warn("Chorus API key was loaded from chorus.json; prefer CHORUS_API_KEY for secrets.")
  }
  await logger.info("Initializing opencode-chorus", {
    directory: ctx.directory,
    worktree: ctx.worktree,
    chorusUrl: config.chorusUrl,
  })
  void notificationListener
    .connect()
    .catch((error) => logger.warn("Chorus notification listener stopped", { error: formatError(error) }))

  return {
    config: applyPluginConfig,
    event: eventHook,
    "tool.execute.after": toolExecuteAfterHook,
  }

  async function handleNotificationEvent(event: SseNotificationEvent): Promise<void> {
    if (event.type !== "new_notification" || !event.notificationUuid) return

    const notification = await fetchUnreadNotificationByUuid(chorusClient, event.notificationUuid)
    if (!notification) return

    const routed = routeNotification(notification, { enableNotificationHints: config.enableNotificationHints })
    if (routed.kind === "ignored") return

    await enqueueRoutedNotification(stateStore, routed)
  }
}

export const ChorusPlugin: Plugin = async (ctx, options) => createPlugin(ctx, options)

export default ChorusPlugin
