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
  name: string
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
    chorus_tools: tool({
      description: "List all available Chorus tools before inspecting or executing one.",
      args: {},
      async execute() {
        const index = await readToolIndex()
        return formatToolResult(listTools(index))
      },
    }),

    chorus_tool_get: tool({
      description: "Get the description for one Chorus tool after listing names with chorus_tools.",
      args: {
        toolName: tool.schema.string().describe("Exact Chorus tool name from chorus_tools, for example: `chorus_get_task`"),
      },
      async execute(args) {
        const index = await readToolIndex()
        const target = index.find((item) => item.name === args.toolName)
        if (!target) throw createToolNotFoundError(args.toolName)
        return formatToolResult(describeTool(target))
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
        argumentPolicy: tool.schema.string().optional().default("default"),
      },
      async execute(args) {
        const index = await readToolIndex()
        const toolName = args.toolName
        const target = index.find((item) => item.name === toolName)
        if (!target) throw createToolNotFoundError(args.toolName)

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
