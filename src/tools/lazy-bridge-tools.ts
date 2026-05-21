import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { tool, type ToolDefinition, type ToolResult } from "@opencode-ai/plugin"
import type { ChorusMcpToolDefinition } from "../chorus/mcp-client"
import { resolveChorusToolScope, type ChorusToolScope } from "../chorus/tool-scope"
import type { SessionContextRecord, SharedState } from "../state/state-types"
import { createWorkspaceContextTool } from "./workspace-context-tool"

// Tools that replace agent-visible `content` with `contentPath` at the bridge boundary.
const MANAGED_DOCUMENT_TOOLS = new Set([
  "chorus_pm_create_document",
  "chorus_pm_add_document_draft",
  "chorus_pm_update_document_draft",
  "chorus_pm_update_document",
])

// Subset of managed tools where a document body is always required.
const CONTENT_PATH_REQUIRED_TOOLS = new Set(["chorus_pm_add_document_draft"])

type ChorusLazyBridgeClient = {
  listTools(): Promise<ChorusMcpToolDefinition[]>
  callTool<T>(name: string, args?: Record<string, unknown>, scope?: ChorusToolScope): Promise<T>
}

const CHORUS_SILENT_AGENTS = new Set(["proposal-reviewer", "task-reviewer"])

type CreateChorusLazyBridgeToolsOptions = {
  chorusClient: ChorusLazyBridgeClient
  stateStore?: {
    readOpenCodeState?(): Promise<{ sessionContext?: SessionContextRecord }>
    updateOpenCodeState(updater: (state: Record<string, unknown>) => Record<string, unknown>): Promise<unknown>
    readSharedState?(): Promise<{ context?: { projectUuid?: string; projectName?: string; projectGroupUuid?: string } }>
    updateSharedState?(updater: (state: SharedState) => SharedState): Promise<SharedState>
  }
  tui?: {
    showToast(input: { title?: string; message?: string; variant?: "info" | "success" | "warning" | "error"; duration?: number }): Promise<unknown>
  }
  chorusUrl?: string
  /** Chorus-managed staging directory; paths inside it are accepted alongside workspace paths. */
  stagingDir?: string
  /** Readiness coordinator for on-demand silent initialization by reviewer agents. */
  readiness?: {
    ensureReady(sessionId: string, mode: "visible" | "silent"): Promise<void>
  }
}

type ToolSearchResult = {
  name: string
  description: string
}

export type ChorusLazyBridge = {
  tools: Record<string, ToolDefinition>
  refresh(): Promise<ChorusMcpToolDefinition[]>
}

// Apply the contentPath overlay to a managed document tool definition.
// Removes the remote `content` field and exposes `contentPath` instead.
function applyContentPathOverlay(toolDef: ChorusMcpToolDefinition): ChorusMcpToolDefinition {
  if (!MANAGED_DOCUMENT_TOOLS.has(toolDef.name)) return toolDef

  const schema = toolDef.inputSchema
  const originalRequired: string[] = Array.isArray(schema.required)
    ? schema.required.filter((f): f is string => typeof f === "string")
    : []
  const originalProperties = isRecord(schema.properties) ? { ...schema.properties } : {}

  delete originalProperties.content
  originalProperties.contentPath = {
    type: "string",
    description:
      "Workspace-relative (or absolute within workspace) path to a local Markdown file whose content will be uploaded as the document body. The bridge reads this file and injects its content into the remote call.",
  }

  const required = originalRequired.filter((f) => f !== "content")
  if (CONTENT_PATH_REQUIRED_TOOLS.has(toolDef.name) && !required.includes("contentPath")) {
    required.push("contentPath")
  }

  return {
    ...toolDef,
    inputSchema: { ...schema, required, properties: originalProperties },
  }
}

// Validate and rewrite arguments for a managed document tool call.
// Reads the file at `contentPath`, injects its text as the real remote `content`,
// and strips `contentPath` before the Chorus MCP call.
// Accepts paths inside `directory` (workspace) or `stagingDir` (Chorus-managed staging area).
export async function rewriteDocumentArgs(
  toolName: string,
  args: Record<string, unknown>,
  directory: string,
  stagingDir?: string,
): Promise<Record<string, unknown>> {
  if (!MANAGED_DOCUMENT_TOOLS.has(toolName)) return args

  if ("content" in args) {
    throw new Error(
      `Tool "${toolName}" requires \`contentPath\` — inline \`content\` is not accepted. ` +
        `Write your document to a local file and pass its workspace path via \`contentPath\`.`,
    )
  }

  const { contentPath, ...rest } = args

  if (contentPath === undefined || contentPath === null) {
    if (CONTENT_PATH_REQUIRED_TOOLS.has(toolName)) {
      throw new Error(
        `Tool "${toolName}" requires \`contentPath\`. ` +
          `Write your document to a local file and pass its workspace-relative path.`,
      )
    }
    return args
  }

  if (typeof contentPath !== "string") {
    throw new Error(`\`contentPath\` must be a string file path.`)
  }

  const resolvedPath = path.resolve(directory, contentPath)

  const isInWorkspace = !path.relative(directory, resolvedPath).startsWith("..")
  const isInStaging = stagingDir ? !path.relative(stagingDir, resolvedPath).startsWith("..") : false

  if (!isInWorkspace && !isInStaging) {
    const allowed = stagingDir
      ? `inside the workspace (${directory}) or the Chorus staging directory (${stagingDir})`
      : `inside the current workspace (${directory})`
    throw new Error(`\`contentPath\` resolves outside the permitted paths. Files must be ${allowed}. Got: ${contentPath}`)
  }

  let fileInfo: { isDirectory(): boolean }
  try {
    fileInfo = await stat(resolvedPath)
  } catch {
    throw new Error(`\`contentPath\` file not found: ${contentPath}`)
  }

  if (fileInfo.isDirectory()) {
    throw new Error(`\`contentPath\` points to a directory, not a file: ${contentPath}`)
  }

  let content: string
  try {
    content = await readFile(resolvedPath, "utf-8")
  } catch {
    throw new Error(`Cannot read \`contentPath\` file: ${contentPath}`)
  }

  return { ...rest, content }
}

export function createChorusLazyBridge(options: CreateChorusLazyBridgeToolsOptions): ChorusLazyBridge {
  let toolIndex: ChorusMcpToolDefinition[] | null = null

  async function readToolIndex(): Promise<ChorusMcpToolDefinition[]> {
    if (toolIndex) return toolIndex
    return refresh()
  }

  async function refresh(): Promise<ChorusMcpToolDefinition[]> {
    await recordLazyBridgeStatus(options, { status: "connecting" })
    try {
      toolIndex = await options.chorusClient.listTools()
      await recordLazyBridgeStatus(options, {
        status: "connected",
        toolCount: toolIndex.length,
        lastRefreshSucceededAt: new Date().toISOString(),
      })
      return toolIndex
    } catch (error) {
      await recordLazyBridgeStatus(options, {
        status: toolIndex ? "stale" : "error",
        toolCount: toolIndex?.length,
        lastRefreshFailedAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.message : String(error),
      })
      if (toolIndex) return toolIndex
      throw error
    }
  }

  const tools = {
    chorus_tools: tool({
      description: "List all available Chorus tools before inspecting or executing one.",
      args: {},
      async execute(_args, ctx) {
        await triggerSilentReadinessIfNeeded(ctx.agent, ctx.sessionID, options)
        const index = await readToolIndex()
        return formatToolResult(listTools(index))
      },
    }),

    chorus_tool_get: tool({
      description: "Get the description for one Chorus tool after listing names with chorus_tools.",
      args: {
        toolName: tool.schema.string().describe("Exact Chorus tool name from chorus_tools, for example: `chorus_get_task`"),
      },
      async execute(args, ctx) {
        await triggerSilentReadinessIfNeeded(ctx.agent, ctx.sessionID, options)
        const index = await readToolIndex()
        const target = index.find((item) => item.name === args.toolName)
        if (!target) throw createToolNotFoundError(args.toolName)
        return formatToolResult(describeTool(applyContentPathOverlay(target)))
      },
    }),

    chorus_tool_execute: tool({
      description: "Execute a Chorus tool by name after listing tools with chorus_tools and inspecting one with chorus_tool_get.",
      args: {
        toolName: tool.schema.string().describe("Chorus tool name, for example: `chorus_get_task`"),
        arguments: tool.schema
          .record(tool.schema.string(), tool.schema.unknown())
          .optional()
          .describe("Arguments for the Chorus tool"),
      },
      async execute(args, ctx) {
        await triggerSilentReadinessIfNeeded(ctx.agent, ctx.sessionID, options)
        const index = await readToolIndex()
        const toolName = args.toolName
        const target = index.find((item) => item.name === toolName)
        if (!target) throw createToolNotFoundError(args.toolName)

        const rawArgs = args.arguments ?? {}
        const rewrittenArgs = await rewriteDocumentArgs(toolName, rawArgs, ctx.directory, options.stagingDir)
        const normalizedArgs = normalizeToolArguments(toolName, rewrittenArgs, target.inputSchema)
        const scope = await resolveChorusToolScope(options.stateStore)
        const result = await options.chorusClient.callTool(toolName, normalizedArgs, scope)
        return formatToolResult(result, {
          chorusToolName: toolName,
        })
      },
    }),

    chorus_workspace_context: createWorkspaceContextTool({
      chorusClient: options.chorusClient,
      stateStore: hasWorkspaceContextStateStore(options.stateStore) ? options.stateStore : undefined,
      tui: options.tui,
    }),
  }

  return { tools, refresh }
}

async function triggerSilentReadinessIfNeeded(
  agent: string,
  sessionId: string,
  options: CreateChorusLazyBridgeToolsOptions,
): Promise<void> {
  if (CHORUS_SILENT_AGENTS.has(agent) && options.readiness) {
    await options.readiness.ensureReady(sessionId, "silent")
  }
}

export function createChorusLazyBridgeTools(options: CreateChorusLazyBridgeToolsOptions): Record<string, ToolDefinition> {
  return createChorusLazyBridge(options).tools
}

function hasWorkspaceContextStateStore(
  stateStore: CreateChorusLazyBridgeToolsOptions["stateStore"],
): stateStore is NonNullable<CreateChorusLazyBridgeToolsOptions["stateStore"]> & {
  readSharedState(): Promise<SharedState>
  updateSharedState(updater: (state: SharedState) => SharedState): Promise<SharedState>
} {
  return typeof stateStore?.readSharedState === "function" && typeof stateStore.updateSharedState === "function"
}

async function recordLazyBridgeStatus(
  options: CreateChorusLazyBridgeToolsOptions,
  status: Record<string, unknown>,
): Promise<void> {
  if (!options.stateStore) return
  const shouldReplacePreviousStatus = status.status === "connected"
  await options.stateStore.updateOpenCodeState((state) => ({
    ...state,
    lazyBridge: {
      ...(shouldReplacePreviousStatus ? {} : isRecord(state.lazyBridge) ? state.lazyBridge : {}),
      ...status,
      ...(options.chorusUrl ? { chorusUrl: options.chorusUrl } : {}),
    },
  }))
}

function listTools(index: ChorusMcpToolDefinition[]) {
  return {
    total: index.length,
    tools: index.map((item): ToolSearchResult => ({
      name: item.name,
      description: item.description ?? "",
    })),
  }
}

function describeTool(toolDefinition: ChorusMcpToolDefinition) {
  const requiredFields = Array.isArray(toolDefinition.inputSchema.required)
    ? toolDefinition.inputSchema.required.filter((item): item is string => typeof item === "string")
    : []
  const properties = isRecord(toolDefinition.inputSchema.properties) ? Object.keys(toolDefinition.inputSchema.properties) : []
  return {
    toolName: toolDefinition.name,
    description: toolDefinition.description ?? "",
    requiredFields,
    optionalFields: properties.filter((property) => !requiredFields.includes(property)),
  }
}

export function normalizeToolArguments(
  toolName: string,
  args: Record<string, unknown>,
  inputSchema: Record<string, unknown>,
): Record<string, unknown> {
  const requiredFields = Array.isArray(inputSchema.required)
    ? inputSchema.required.filter((item): item is string => typeof item === "string")
    : []
  const normalized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(args)) {
    if (value === undefined) continue
    if (value === null && !requiredFields.includes(key)) continue
    if (toolName === "chorus_update_task" && (key === "title" || key === "description") && value === "") continue
    if (toolName === "chorus_update_task" && (key === "taskUuid" || key === "status") && value === "") {
      throw new Error(`chorus_update_task requires non-empty ${key}`)
    }
    normalized[key] = value
  }

  return normalized
}

function createToolNotFoundError(toolName: string): Error {
  return new Error(`Tool "${toolName}" not found. Call \`chorus_tools\` first to list available tools.`)
}

function formatToolResult(value: unknown, metadata?: Record<string, unknown>): ToolResult {
  const output = typeof value === "string" ? value : JSON.stringify(value, null, 2)
  return metadata ? { output, metadata } : output
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
