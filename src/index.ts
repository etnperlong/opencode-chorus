import type { Plugin } from "@opencode-ai/plugin"
import { ChorusMcpClient } from "./chorus/mcp-client"
import { loadChorusConfig } from "./config/config-loader"
import { isMissingRequiredConfigError } from "./config/error-guards"
import { createPluginConfigApplier } from "./config/plugin-config"
import { createPluginEventHook } from "./hooks/plugin-event-hook"
import { createPermissionAskHook } from "./hooks/permission-ask-hook"
import { createSystemTransformHook } from "./hooks/system-transform-hook"
import { createToolExecuteAfterHook } from "./hooks/tool-execute-after-hook"
import { PlanningLifecycle } from "./lifecycle/planning-lifecycle"
import { SessionLifecycle } from "./lifecycle/session-lifecycle"
import { NotificationCoordinator } from "./notifications/notification-coordinator"
import { StateStore } from "./state/state-store"
import { createChorusLazyBridge } from "./tools/lazy-bridge-tools"
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
  const applyPluginConfig = createPluginConfigApplier()
  const stateStore = new StateStore({
    projectRoot: ctx.directory,
    worktree: ctx.worktree,
    stateMode: config.stateMode,
    stateDir: config.stateDir,
    globalStateRoot: config.globalStateRoot,
  })
  await stateStore.init()
  const chorusClient = new ChorusMcpClient({
    chorusUrl: config.chorusUrl,
    apiKey: config.apiKey,
  })
  const lazyBridge = createChorusLazyBridge({
    chorusClient,
    stateStore,
    tui: ctx.client.tui
      ? {
          showToast: async (input) => {
            await ctx.client.tui.showToast({ body: { ...input, message: input.message ?? "", variant: input.variant ?? "info" } })
          },
        }
      : undefined,
    chorusUrl: config.chorusUrl,
    stagingDir: stateStore.paths.stagingDir,
  })
  const sessionLifecycle = new SessionLifecycle(stateStore, chorusClient, config.chorusUrl)
  const planningLifecycle = new PlanningLifecycle(stateStore)
  const notificationCoordinator = new NotificationCoordinator({
    chorusUrl: config.chorusUrl,
    apiKey: config.apiKey,
    autoStart: config.autoStart,
    enableNotificationHints: config.enableNotificationHints,
    directory: ctx.directory,
    stateStore,
    chorusClient,
    client: ctx.client,
    logger,
  })
  const eventHook = createPluginEventHook({
    autoStart: config.autoStart,
    enableSessionContextSummary: config.enableSessionContextSummary,
    stateStore,
    sessionLifecycle,
    logger,
    stagingDir: stateStore.paths.stagingDir,
    onSessionStartup: async () => {
      await lazyBridge.refresh()
    },
    onSessionReady: async (sessionId) => {
      await notificationCoordinator.handleSessionReady(sessionId)
    },
    onSessionIdle: async (sessionId) => {
      await notificationCoordinator.handleSessionIdle(sessionId)
    },
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
  const permissionAskHook = createPermissionAskHook({
    stagingDir: stateStore.paths.stagingDir,
  })
  const systemTransformHook = createSystemTransformHook({
    stagingDir: stateStore.paths.stagingDir,
  })
  if (loadedConfig.metadata.apiKeySource === "chorus.json") {
    await logger.warn("Chorus API key was loaded from chorus.json; prefer CHORUS_API_KEY for secrets.")
  }
  if (loadedConfig.metadata.stateDirSource && config.stateMode !== "project") {
    await logger.warn("Chorus stateDir is deprecated and ignored unless stateMode is project.")
  }
  if (stateStore.fallbackReason) {
    await logger.warn("Fell back to project-local Chorus state", { reason: stateStore.fallbackReason })
  }
  await logger.info("Initializing opencode-chorus", {
    directory: ctx.directory,
    worktree: ctx.worktree,
    chorusUrl: config.chorusUrl,
    stateMode: stateStore.paths.mode,
    stateFile: stateStore.paths.stateFile,
  })
  await notificationCoordinator.start()

  return {
    config: applyPluginConfig,
    event: eventHook,
    "permission.ask": permissionAskHook,
    "tool.execute.after": toolExecuteAfterHook,
    "experimental.chat.system.transform": systemTransformHook,
    tool: lazyBridge.tools,
  }
}

export const ChorusPlugin: Plugin = async (ctx, options) => createPlugin(ctx, options)

export default ChorusPlugin
