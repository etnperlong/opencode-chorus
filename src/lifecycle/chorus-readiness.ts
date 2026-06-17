import { isOpenSpecCliAvailable } from "../openspec/cli"
import { detectOpenSpecAvailability } from "../openspec/detect"
import type { AgentPermissionsRecord, SessionContextRecord } from "../state/state-types"
import type { SessionLifecycle } from "./session-lifecycle"

type ChorusReadinessStateStore = {
  readOpenCodeState(): Promise<{ sessionContext?: SessionContextRecord }>
  readSharedState?(): Promise<{ context?: { projectUuid?: string; projectGroupUuid?: string } }>
  updateOpenCodeState(updater: (state: Record<string, unknown>) => Record<string, unknown>): Promise<unknown>
}

type ChorusReadinessClient = {
  callTool<T>(name: string, args?: Record<string, unknown>): Promise<T>
}

type ChorusReadinessBridge = {
  refresh(): Promise<unknown>
}

type ChorusReadinessTui = {
  showToast(input: {
    title?: string
    message?: string
    variant?: "info" | "success" | "warning" | "error"
    duration?: number
  }): Promise<unknown>
}

export type ChorusReadinessOptions = {
  sessionLifecycle: SessionLifecycle
  chorusClient: ChorusReadinessClient
  stateStore: ChorusReadinessStateStore
  lazyBridge: ChorusReadinessBridge
  onReady?: (sessionId: string) => Promise<void>
  tui?: ChorusReadinessTui
  directory: string
  enableSessionContextSummary?: boolean
  logger?: { info(message: string): Promise<void> }
  stagingDir?: string
}

export class ChorusReadiness {
  private doneSessionIds = new Set<string>()
  private inFlightReadiness = new Map<string, Promise<void>>()
  private hasShownConnectionToast = false

  constructor(private readonly options: ChorusReadinessOptions) {}

  async ensureReady(sessionId: string, mode: "visible" | "silent"): Promise<void> {
    if (this.doneSessionIds.has(sessionId)) return

    const inflight = this.inFlightReadiness.get(sessionId)
    if (inflight) return inflight

    const promise = this.runReadiness(sessionId, mode).then(
      () => {
        this.doneSessionIds.add(sessionId)
        this.inFlightReadiness.delete(sessionId)
      },
      (error: unknown) => {
        this.inFlightReadiness.delete(sessionId)
        throw error
      },
    )
    this.inFlightReadiness.set(sessionId, promise)
    return promise
  }

  markSessionEnded(sessionId: string): void {
    this.doneSessionIds.delete(sessionId)
    this.inFlightReadiness.delete(sessionId)
  }

  async showConnectionToast(): Promise<void> {
    if (this.hasShownConnectionToast) return

    const state = await this.options.stateStore.readOpenCodeState()
    const context = state.sessionContext

    const [projectGroupName, boundProjectUuid, openSpecAvailable] = await Promise.all([
      this.resolveProjectGroupName(context),
      this.resolveBoundProjectUuid(),
      this.detectOpenSpec(),
    ])

    const agentName = context?.agent?.name ?? "Chorus"
    const projects = filterProjectsByBinding(context?.projects ?? [], boundProjectUuid)
    const scopeStr = buildProjectScopeStr(projects, projectGroupName)
    const lines: string[] = [`▣ Agent: ${agentName}`]
    if (scopeStr) lines.push(`▣ Project: ${scopeStr}`)
    if (openSpecAvailable) lines.push("", "(+ OpenSpec)")
    await this.showToast({
      title: "Chorus connected",
      message: lines.join("\n"),
      variant: "success",
    })
    this.hasShownConnectionToast = true
  }

  private async runReadiness(sessionId: string, mode: "visible" | "silent"): Promise<void> {
    try {
      // 1. Checkin + context update + staging dir (via session lifecycle)
      await this.options.sessionLifecycle.start(sessionId)

      // 2. Refresh bridge tool index (no toast)
      await this.options.lazyBridge.refresh()

      if (mode === "visible") {
        // 3. Read session context for toast
        const state = await this.options.stateStore.readOpenCodeState()
        const context = state.sessionContext

        // 4. Scope enrichment and OpenSpec detection in parallel (best-effort)
        const [projectGroupName, boundProjectUuid, openSpecAvailable] = await Promise.all([
          this.resolveProjectGroupName(context),
          this.resolveBoundProjectUuid(),
          this.detectOpenSpec(),
        ])

        // 5. Emit a single combined success toast
        const agentName = context?.agent?.name ?? "Chorus"
        const projects = filterProjectsByBinding(context?.projects ?? [], boundProjectUuid)
        const scopeStr = buildProjectScopeStr(projects, projectGroupName)
        const lines: string[] = [`▣ Agent: ${agentName}`]
        if (scopeStr) lines.push(`▣ Project: ${scopeStr}`)
        if (openSpecAvailable) lines.push("", "(+ OpenSpec)")
        await this.showToast({
          title: "Chorus connected",
          message: lines.join("\n"),
          variant: "success",
        })

        // 6. Surface context summary to logger if enabled
        const { sessionLifecycle, logger, stagingDir, enableSessionContextSummary } = this.options
        if (enableSessionContextSummary && logger) {
          await sessionLifecycle.surfaceContextSummary(sessionId, logger, stagingDir)
        }

        // 7. Store readiness record
        await this.options.stateStore.updateOpenCodeState((state) => ({
          ...state,
          chorusReadiness: {
            sessionId,
            status: "ready",
            agentName,
            openSpecAvailable,
            lastReadyAt: new Date().toISOString(),
          },
        }))
      }

      await this.options.onReady?.(sessionId)
    } catch (error) {
      if (mode === "visible") {
        await this.showToast({
          title: "Chorus connection failed",
          message: "Check Chorus configuration",
          variant: "error",
        })
        await this.options.stateStore.updateOpenCodeState((state) => ({
          ...state,
          chorusReadiness: {
            sessionId,
            status: "error",
            lastError: error instanceof Error ? error.message : String(error),
          },
        }))
      }
      throw error
    }
  }

  private async resolveProjectGroupName(context: SessionContextRecord | undefined): Promise<string | undefined> {
    if (!context) return undefined

    try {
      const sharedState = await this.options.stateStore.readSharedState?.()
      const projectGroupUuid = sharedState?.context?.projectGroupUuid
      if (!projectGroupUuid) return undefined

      const result = await this.options.chorusClient.callTool<unknown>("chorus_get_project_group", { projectGroupUuid })
      if (isRecord(result) && typeof result.name === "string") return result.name
    } catch {
      // best-effort; fall through to undefined
    }

    return undefined
  }

  private async resolveBoundProjectUuid(): Promise<string | undefined> {
    try {
      const sharedState = await this.options.stateStore.readSharedState?.()
      return sharedState?.context?.projectUuid
    } catch {
      return undefined
    }
  }

  private async detectOpenSpec(): Promise<boolean> {
    try {
      const availability = await detectOpenSpecAvailability(this.options.directory, () => isOpenSpecCliAvailable())
      return availability.available
    } catch {
      return false
    }
  }

  private async showToast(input: {
    title: string
    message: string
    variant: "info" | "success" | "warning" | "error"
  }): Promise<void> {
    await this.options.tui?.showToast({ ...input, duration: 4000 }).catch(() => {})
  }
}

// --- scope enrichment helpers (task 3.1) ---

export function formatPermissions(permissions: SessionContextRecord["agent"] extends infer T
  ? T extends { permissions?: infer P }
    ? P | undefined
    : never
  : never): string {
  if (!permissions) return ""
  if (Array.isArray(permissions)) {
    const items = (permissions as string[]).slice(0, 4)
    return items.join(", ") + (permissions.length > 4 ? "…" : "")
  }
  if (isRecord(permissions)) {
    const record = permissions as AgentPermissionsRecord
    const parts = Object.entries(record)
      .filter(([, v]) => v !== false && (Array.isArray(v) ? (v as string[]).length > 0 : true))
      .slice(0, 3)
      .map(([resource, actions]) => {
        if (Array.isArray(actions)) return `${resource}:${(actions as string[]).join(",")}`
        return resource
      })
    return parts.join(" · ")
  }
  return ""
}

export function filterProjectsByBinding(
  projects: SessionContextRecord["projects"],
  boundProjectUuid: string | undefined,
): SessionContextRecord["projects"] {
  if (!boundProjectUuid) return projects
  return projects.filter((project) => project.uuid === boundProjectUuid)
}

export function buildProjectScopeStr(
  projects: SessionContextRecord["projects"],
  projectGroupName?: string,
): string {
  if (projects.length !== 1) return ""
  const name = projects[0]!.name
  if (projectGroupName) return `${name} (${projectGroupName})`
  return name
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
