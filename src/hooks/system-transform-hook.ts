// Injects concise system guidance for Chorus file-writing workflows.
// This steers agents toward native file tools and the managed staging directory.

import { formatPermissions } from "../lifecycle/chorus-readiness"
import { isOpenSpecCliAvailable } from "../openspec/cli"
import { detectOpenSpecAvailability } from "../openspec/detect"
import type { SessionContextRecord } from "../state/state-types"
import {
  formatStagingDirSystemGuidance,
  PREFER_NATIVE_FILE_TOOLS_GUIDANCE,
} from "../util/staging-guidance"

export const CHORUS_SKILL_FIRST_GUIDANCE =
  "When using Chorus in this workspace, load the narrowest Chorus skill for workflow details, use `chorus_tools`, `chorus_tool_get`, and `chorus_tool_execute` to discover remote tools, and avoid relying on duplicated long-form workflow manuals in system prompts."

type SystemTransformInput = {
  sessionID?: string
}

type SystemTransformOutput = {
  system: string[]
}

type SystemTransformStateStore = {
  readOpenCodeState(): Promise<{ sessionContext?: SessionContextRecord }>
  readSharedState?(): Promise<{ context?: { projectUuid?: string; projectGroupUuid?: string } }>
}

type CreateSystemTransformHookOptions = {
  stagingDir?: string
  stateStore?: SystemTransformStateStore
  projectUuids?: string[]
  directory?: string
  isOpenSpecAvailable?: () => Promise<boolean>
}

type ProjectScope =
  | {
      kind: "managed"
      source: "config" | "shared" | "session"
      projectUuid?: string
      projectName?: string
    }
  | {
      kind: "ambiguous"
      source: "config" | "shared" | "session"
      projectGroupUuid?: string
      projectCount?: number
    }
  | {
      kind: "unmanaged"
    }

export function createSystemTransformHook(options: CreateSystemTransformHookOptions) {
  let openSpecAvailablePromise: Promise<boolean> | undefined

  const readOpenSpecAvailability = async () => {
    if (options.isOpenSpecAvailable) return options.isOpenSpecAvailable()
    if (!options.directory) return false
    openSpecAvailablePromise ??= detectOpenSpecAvailability(options.directory, () => isOpenSpecCliAvailable())
      .then((availability) => availability.available)
      .catch(() => false)
    return openSpecAvailablePromise
  }

  return async (input: SystemTransformInput, output: SystemTransformOutput): Promise<void> => {
    output.system.push(PREFER_NATIVE_FILE_TOOLS_GUIDANCE)
    output.system.push(CHORUS_SKILL_FIRST_GUIDANCE)

    const chorusContext = await buildChorusSystemContext(input, options, readOpenSpecAvailability)
    if (chorusContext) output.system.push(chorusContext)

    if (options.stagingDir) output.system.push(formatStagingDirSystemGuidance(options.stagingDir))
  }
}

async function buildChorusSystemContext(
  input: SystemTransformInput,
  options: CreateSystemTransformHookOptions,
  readOpenSpecAvailability: () => Promise<boolean>,
): Promise<string> {
  const [state, sharedState, openSpecAvailable] = await Promise.all([
    readOpenCodeStateSafe(options.stateStore),
    readSharedStateSafe(options.stateStore),
    readOpenSpecAvailability(),
  ])

  const sessionContext = getMatchingSessionContext(state?.sessionContext, input.sessionID)
  const projectScope = resolveProjectScope({
    configuredProjectUuids: options.projectUuids ?? [],
    sharedContext: sharedState?.context,
    sessionContext,
  })

  const lines = ["Chorus Context:"]
  lines.push(`- Chorus project scope: ${projectScope.kind}`)

  if (projectScope.kind === "managed") {
    if (projectScope.projectName && projectScope.projectUuid) {
      lines.push(`- Project: ${projectScope.projectName} (${projectScope.projectUuid})`)
    } else if (projectScope.projectName) {
      lines.push(`- Project: ${projectScope.projectName}`)
    } else if (projectScope.projectUuid) {
      lines.push(`- Project UUID: ${projectScope.projectUuid}`)
    }
  }

  if (projectScope.kind === "ambiguous") {
    lines.push("- Multiple Chorus projects may apply here; do not assume projectUuid.")
    if (projectScope.projectGroupUuid) lines.push(`- Project group UUID: ${projectScope.projectGroupUuid}`)
    if (typeof projectScope.projectCount === "number") lines.push(`- Candidate project count: ${projectScope.projectCount}`)
  }

  if (projectScope.kind === "unmanaged") {
    lines.push("- This workspace is not linked to a single Chorus project; do not assume projectUuid.")
  }

  if (sessionContext?.agent?.name) lines.push(`- Agent: ${sessionContext.agent.name}`)

  const permissionsSummary = formatPermissions(sessionContext?.agent?.permissions)
  if (permissionsSummary) lines.push(`- Permissions: ${permissionsSummary}`)

  const ownerSummary = formatOwnerSummary(sessionContext?.owner)
  if (ownerSummary) lines.push(`- Owner: ${ownerSummary}`)

  lines.push(`- OpenSpec: ${openSpecAvailable ? "available" : "unavailable"}`)

  return lines.join("\n")
}

function resolveProjectScope(options: {
  configuredProjectUuids: string[]
  sharedContext?: { projectUuid?: string; projectGroupUuid?: string }
  sessionContext?: SessionContextRecord
}): ProjectScope {
  const configuredProjectUuids = options.configuredProjectUuids.filter(Boolean)
  const sessionProjects = options.sessionContext?.projects ?? []

  if (configuredProjectUuids.length === 1) {
    const projectUuid = configuredProjectUuids[0]
    const projectName = sessionProjects.find((project) => project.uuid === projectUuid)?.name
    return { kind: "managed", source: "config", projectUuid, ...(projectName ? { projectName } : {}) }
  }

  if (options.sharedContext?.projectUuid) {
    const projectUuid = options.sharedContext.projectUuid
    const projectName = sessionProjects.find((project) => project.uuid === projectUuid)?.name
    return { kind: "managed", source: "shared", projectUuid, ...(projectName ? { projectName } : {}) }
  }

  if (options.sharedContext?.projectGroupUuid) {
    return {
      kind: "ambiguous",
      source: "shared",
      projectGroupUuid: options.sharedContext.projectGroupUuid,
      ...(sessionProjects.length > 0 ? { projectCount: sessionProjects.length } : {}),
    }
  }

  if (sessionProjects.length === 1) {
    return {
      kind: "managed",
      source: "session",
      projectUuid: sessionProjects[0]?.uuid,
      projectName: sessionProjects[0]?.name,
    }
  }

  if (sessionProjects.length > 1) {
    return { kind: "ambiguous", source: "session", projectCount: sessionProjects.length }
  }

  if (configuredProjectUuids.length > 1) {
    return { kind: "ambiguous", source: "config", projectCount: configuredProjectUuids.length }
  }

  return { kind: "unmanaged" }
}

async function readOpenCodeStateSafe(stateStore: SystemTransformStateStore | undefined): Promise<{ sessionContext?: SessionContextRecord } | undefined> {
  if (!stateStore) return undefined
  try {
    return await stateStore.readOpenCodeState()
  } catch {
    return undefined
  }
}

async function readSharedStateSafe(
  stateStore: SystemTransformStateStore | undefined,
): Promise<{ context?: { projectUuid?: string; projectGroupUuid?: string } } | undefined> {
  if (!stateStore?.readSharedState) return undefined
  try {
    return await stateStore.readSharedState()
  } catch {
    return undefined
  }
}

function getMatchingSessionContext(
  sessionContext: SessionContextRecord | undefined,
  sessionID: string | undefined,
): SessionContextRecord | undefined {
  if (!sessionContext || !sessionID) return undefined
  return sessionContext.runtimeSessionId === sessionID ? sessionContext : undefined
}

function formatOwnerSummary(owner: SessionContextRecord["owner"]): string | undefined {
  if (!owner) return undefined
  if (owner.name && owner.uuid) return `${owner.name} (${owner.uuid})`
  return owner.name ?? owner.uuid
}
