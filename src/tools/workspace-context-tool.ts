import { tool, type ToolDefinition, type ToolResult } from "@opencode-ai/plugin"
import type { SessionContextRecord, SharedState } from "../state/state-types"

type WorkspaceContextStateStore = {
  readOpenCodeState?(): Promise<{ sessionContext?: SessionContextRecord }>
  readSharedState(): Promise<SharedState>
  updateSharedState(updater: (state: SharedState) => SharedState): Promise<SharedState>
}

type WorkspaceContextClient = {
  callTool<T>(name: string, args?: Record<string, unknown>): Promise<T>
}

type WorkspaceContextTui = {
  showToast(input: { title?: string; message?: string; variant?: "info" | "success" | "warning" | "error"; duration?: number }): Promise<unknown>
}

type CreateWorkspaceContextToolOptions = {
  chorusClient: WorkspaceContextClient
  stateStore?: WorkspaceContextStateStore
  tui?: WorkspaceContextTui
  beforeExecute?: (args: { action: "bind_project" | "unbind_project" | "show"; projectUuid?: string }, ctx: { agent: string; sessionID: string }) => Promise<void>
}

export function createWorkspaceContextTool(options: CreateWorkspaceContextToolOptions): ToolDefinition {
  return tool({
    description:
      "Local-only tool for persisting or clearing this workspace's Chorus context. Use only when the user explicitly asks to bind or unbind the workspace.",
    args: {
      action: tool.schema
        .enum(["bind_project", "unbind_project", "show"])
        .describe("Use bind_project to persist a Chorus project UUID, unbind_project to clear it, or show to inspect current context."),
      projectUuid: tool.schema.string().optional().describe("Chorus project UUID. Required when action is bind_project."),
    },
    async execute(args, ctx) {
      await options.beforeExecute?.(args, ctx)
      if (!options.stateStore) throw new Error("Chorus workspace context store is unavailable.")
      if (args.action === "bind_project") return bindProject(args.projectUuid, options)
      if (args.action === "unbind_project") return unbindProject(options)
      return formatToolResult({ status: "ok", context: (await options.stateStore.readSharedState()).context })
    },
  })
}

async function bindProject(projectUuidInput: string | undefined, options: CreateWorkspaceContextToolOptions): Promise<ToolResult> {
  const projectUuid = normalizeString(projectUuidInput)
  if (!projectUuid) throw new Error("projectUuid is required when action is bind_project.")
  if (!options.stateStore) throw new Error("Chorus workspace context store is unavailable.")

  const projectName = await resolveProjectName(projectUuid, options)
  const context = {
    projectUuid,
    ...(projectName ? { projectName } : {}),
  }
  const next = await options.stateStore.updateSharedState((state) => ({
    ...state,
    lastActiveRuntime: "opencode",
    lastUpdatedAt: new Date().toISOString(),
    context,
  }))

  const display = formatProjectDisplay(projectUuid, projectName)
  await showToast(options.tui, {
    title: "Chorus workspace bound",
    message: `Bound to ${display}`,
    variant: "success",
  })

  return formatToolResult({ status: "bound", context: next.context })
}

async function unbindProject(options: CreateWorkspaceContextToolOptions): Promise<ToolResult> {
  if (!options.stateStore) throw new Error("Chorus workspace context store is unavailable.")
  const previous = await options.stateStore.readSharedState()
  const previousDisplay = previous.context.projectUuid
    ? formatProjectDisplay(previous.context.projectUuid, previous.context.projectName)
    : undefined
  const next = await options.stateStore.updateSharedState((state) => ({
    ...state,
    lastActiveRuntime: "opencode",
    lastUpdatedAt: new Date().toISOString(),
    context: {},
  }))

  await showToast(options.tui, {
    title: "Chorus workspace unbound",
    message: previousDisplay ? `Removed binding to ${previousDisplay}` : "No Chorus project binding was set",
    variant: "info",
  })

  return formatToolResult({ status: "unbound", context: next.context })
}

async function resolveProjectName(projectUuid: string, options: CreateWorkspaceContextToolOptions): Promise<string | undefined> {
  const state = await options.stateStore?.readOpenCodeState?.().catch(() => undefined)
  const cachedProject = state?.sessionContext?.projects.find((project) => project.uuid === projectUuid)
  if (cachedProject?.name) return cachedProject.name

  const project = await options.chorusClient.callTool<unknown>("chorus_get_project", { projectUuid }).catch(() => undefined)
  return extractDisplayName(project)
}

function extractDisplayName(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  for (const key of ["name", "title", "summary"]) {
    const candidate = value[key]
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim()
  }
}

function formatProjectDisplay(projectUuid: string, projectName: string | undefined): string {
  return projectName ? `${projectName} (${projectUuid})` : projectUuid
}

async function showToast(
  tui: WorkspaceContextTui | undefined,
  input: { title: string; message: string; variant: "info" | "success" },
): Promise<void> {
  await tui?.showToast(input).catch(() => {})
}

function formatToolResult(value: unknown): ToolResult {
  return JSON.stringify(value, null, 2)
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
