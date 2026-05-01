import { tool, type ToolDefinition, type ToolResult } from "@opencode-ai/plugin"
import type { ChorusMcpToolDefinition } from "../chorus/mcp-client"
import { resolveChorusToolScope, type ChorusToolScope } from "../chorus/tool-scope"

type ChorusLazyBridgeClient = {
  listTools(): Promise<ChorusMcpToolDefinition[]>
  callTool<T>(name: string, args?: Record<string, unknown>, scope?: ChorusToolScope): Promise<T>
}

type CreateChorusLazyBridgeToolsOptions = {
  chorusClient: ChorusLazyBridgeClient
  stateStore?: {
    updateOpenCodeState(updater: (state: Record<string, unknown>) => Record<string, unknown>): Promise<unknown>
    readSharedState?(): Promise<{ context?: { projectUuid?: string; projectGroupUuid?: string } }>
  }
  tui?: {
    showToast(input: { title?: string; message?: string; variant?: "info" | "success" | "warning" | "error"; duration?: number }): Promise<unknown>
  }
  chorusUrl?: string
}

type ToolSearchResult = {
  toolName: string
  description: string
}

export type ChorusLazyBridge = {
  tools: Record<string, ToolDefinition>
  refresh(): Promise<ChorusMcpToolDefinition[]>
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
      await showLazyBridgeToast(options, {
        title: "Chorus tools connected",
        message: `${toolIndex.length} tools available`,
        variant: "success",
      })
      return toolIndex
    } catch (error) {
      await recordLazyBridgeStatus(options, {
        status: toolIndex ? "stale" : "error",
        toolCount: toolIndex?.length,
        lastRefreshFailedAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.message : String(error),
      })
      await showLazyBridgeToast(options, {
        title: toolIndex ? "Chorus tools stale" : "Chorus tools unavailable",
        message: toolIndex ? "Using cached Chorus tools" : "Refresh failed; check Chorus configuration",
        variant: toolIndex ? "warning" : "error",
      })
      if (toolIndex) return toolIndex
      throw error
    }
  }

  const tools = {
    chorus_tool_explore: tool({
      description: "Explore available Chorus tools by name or natural-language query before executing them.",
      args: {
        query: tool.schema.string().optional().describe("Search terms for the Chorus tool you need"),
        toolName: tool.schema.string().optional().describe("Exact Chorus tool name to inspect"),
        limit: tool.schema.number().optional().default(5).describe("Maximum search results to return"),
        includeSchema: tool.schema.boolean().optional().default(false).describe("Include full input schema"),
      },
      async execute(args) {
        const index = await readToolIndex()
        const requestedToolName = args.toolName ? resolveRealChorusToolName(index, args.toolName) : undefined
        const results = exploreTools(index, {
          query: args.query,
          toolName: requestedToolName,
          limit: args.limit,
          includeSchema: args.includeSchema,
        })
        return formatToolResult(results)
      },
    }),

    chorus_tool_execute: tool({
      description: "Execute a real Chorus MCP tool by name after inspecting it with chorus_tool_explore.",
      args: {
        toolName: tool.schema.string().describe("Real Chorus MCP tool name, for example chorus_get_task"),
        arguments: tool.schema
          .record(tool.schema.string(), tool.schema.unknown())
          .optional()
          .describe("Arguments for the real Chorus tool"),
        argumentPolicy: tool.schema.string().optional().default("default"),
      },
      async execute(args) {
        const index = await readToolIndex()
        const toolName = resolveRealChorusToolName(index, args.toolName)
        const target = index.find((item) => item.name === toolName)
        if (!target) throw new Error(`Unknown Chorus tool: ${args.toolName}. Use chorus_tool_explore first.`)

        const policy = args.argumentPolicy === "raw" || args.argumentPolicy === "strict" ? args.argumentPolicy : "default"
        const normalizedArgs =
          policy === "raw"
            ? (args.arguments ?? {})
            : normalizeToolArguments(toolName, args.arguments ?? {}, target.inputSchema)
        const scope = await resolveChorusToolScope(options.stateStore)
        const result = await options.chorusClient.callTool(toolName, normalizedArgs, scope)
        return formatToolResult(result, {
          chorusToolName: toolName,
          argumentPolicy: policy,
        })
      },
    }),
  }

  return { tools, refresh }
}

async function showLazyBridgeToast(
  options: CreateChorusLazyBridgeToolsOptions,
  input: { title: string; message: string; variant: "info" | "success" | "warning" | "error" },
): Promise<void> {
  await options.tui?.showToast({ ...input, duration: 4000 }).catch(() => {})
}

export function createChorusLazyBridgeTools(options: CreateChorusLazyBridgeToolsOptions): Record<string, ToolDefinition> {
  return createChorusLazyBridge(options).tools
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

function exploreTools(
  index: ChorusMcpToolDefinition[],
  options: { query?: string; toolName?: string; limit?: number; includeSchema?: boolean },
) {
  if (options.toolName) {
    const found = index.find((item) => item.name === options.toolName)
    return {
      tool: found ? describeTool(found, Boolean(options.includeSchema)) : null,
    }
  }

  const query = options.query?.toLowerCase().trim()
  const queryTokens = query?.split(/\s+/).filter(Boolean) ?? []
  const candidates = query
    ? index.filter((item) => {
        const haystack = `${item.name} ${item.description ?? ""}`.toLowerCase()
        return queryTokens.every((token) => haystack.includes(token))
      })
    : index

  return {
    results: candidates.slice(0, options.limit ?? 5).map((item): ToolSearchResult => ({
      toolName: toPublicChorusToolName(item.name),
      description: item.description ?? "",
    })),
  }
}

function describeTool(toolDefinition: ChorusMcpToolDefinition, includeSchema: boolean) {
  const requiredFields = Array.isArray(toolDefinition.inputSchema.required)
    ? toolDefinition.inputSchema.required.filter((item): item is string => typeof item === "string")
    : []
  const properties = isRecord(toolDefinition.inputSchema.properties) ? Object.keys(toolDefinition.inputSchema.properties) : []
  return {
    toolName: toPublicChorusToolName(toolDefinition.name),
    description: toolDefinition.description ?? "",
    requiredFields,
    optionalFields: properties.filter((property) => !requiredFields.includes(property)),
    ...(includeSchema ? { inputSchema: toolDefinition.inputSchema } : {}),
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

function resolveRealChorusToolName(index: ChorusMcpToolDefinition[], toolName: string): string {
  if (index.some((item) => item.name === toolName)) return toolName
  const prefixed = `chorus_${toolName}`
  return index.some((item) => item.name === prefixed) ? prefixed : toolName
}

function toPublicChorusToolName(toolName: string): string {
  return toolName.startsWith("chorus_") ? toolName.slice("chorus_".length) : toolName
}

function formatToolResult(value: unknown, metadata?: Record<string, unknown>): ToolResult {
  const output = typeof value === "string" ? value : JSON.stringify(value, null, 2)
  return metadata ? { output, metadata } : output
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
