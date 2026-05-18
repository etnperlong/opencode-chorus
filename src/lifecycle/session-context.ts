import type { SessionContextRecord } from "../state/state-types"

export function buildSessionContext(checkin: unknown, runtimeSessionId: string, now = new Date()): SessionContextRecord {
  const record = isRecord(checkin) ? checkin : {}
  const agentRecord = isRecord(record.agent) ? record.agent : {}
  return {
    source: "chorus_checkin",
    runtimeSessionId,
    lastRefreshedAt: now.toISOString(),
    agent: readAgent(agentRecord),
    owner: readNamedEntity(agentRecord.owner),
    projects: record.projects === undefined ? readIdeaTracker(record.ideaTracker) : readProjects(record.projects),
    notifications: { unread: readUnreadNotificationCount(record.notifications) },
  }
}

export function formatSessionContextSummary(context: SessionContextRecord): string {
  const agentName = context.agent?.name ?? "Chorus agent"
  const notificationCount = context.notifications?.unread ?? 0
  const project = context.projects[0]
  const projectSummary = project ? formatProjectSummary(project) : "no tracked Chorus projects"
  return `Chorus context: ${agentName} connected; ${formatCount(notificationCount, "unread notification")}; ${projectSummary}.`
}

function readAgent(value: unknown): SessionContextRecord["agent"] {
  if (!isRecord(value)) return undefined
  const permissions = readPermissions(value.permissions)

  return {
    ...(typeof value.uuid === "string" ? { uuid: value.uuid } : {}),
    ...(typeof value.name === "string" ? { name: value.name } : {}),
    ...(permissions !== undefined ? { permissions } : {}),
  }
}

function readPermissions(value: unknown): SessionContextRecord["agent"] extends infer T
  ? T extends { permissions?: infer P }
    ? P | undefined
    : never
  : never {
  if (Array.isArray(value)) return value.map(String)
  if (!isRecord(value)) return undefined

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, allowed]) => typeof allowed === "boolean" || Array.isArray(allowed))
      .map(([permission, allowed]) => [permission, Array.isArray(allowed) ? allowed.map(String) : allowed]),
  ) as Record<string, boolean | string[]>
}

function readNamedEntity(value: unknown): { uuid?: string; name?: string } | undefined {
  if (!isRecord(value)) return undefined
  return {
    ...(typeof value.uuid === "string" ? { uuid: value.uuid } : {}),
    ...(typeof value.name === "string" ? { name: value.name } : {}),
  }
}

function readProjects(value: unknown): SessionContextRecord["projects"] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.uuid !== "string" || typeof item.name !== "string") return []
    return [
      {
        uuid: item.uuid,
        name: item.name,
        ...(typeof item.ideaCount === "number" ? { ideaCount: item.ideaCount } : {}),
        ...(typeof item.taskCount === "number" ? { taskCount: item.taskCount } : {}),
        ...(typeof item.pendingProposalCount === "number" ? { pendingProposalCount: item.pendingProposalCount } : {}),
      },
    ]
  })
}

function readIdeaTracker(value: unknown): SessionContextRecord["projects"] {
  if (!isRecord(value)) return []
  return Object.entries(value).flatMap(([uuid, item]) => {
    if (!isRecord(item) || typeof item.name !== "string") return []
    const ideas = Array.isArray(item.ideas) ? item.ideas : []
    const taskCount = sumIdeaField(ideas, "taskCount")
    const pendingProposalCount = sumIdeaField(ideas, "pendingProposalCount")
    return [
      {
        uuid,
        name: item.name,
        ideaCount: ideas.length,
        ...(taskCount !== undefined ? { taskCount } : {}),
        ...(pendingProposalCount !== undefined ? { pendingProposalCount } : {}),
      },
    ]
  })
}

function sumIdeaField(ideas: unknown[], field: "taskCount" | "pendingProposalCount"): number | undefined {
  let total = 0
  let found = false
  for (const idea of ideas) {
    if (!isRecord(idea) || typeof idea[field] !== "number") continue
    total += idea[field]
    found = true
  }
  return found ? total : undefined
}

function readUnreadNotificationCount(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (isRecord(value) && typeof value.unread === "number") return value.unread
  if (isRecord(value) && typeof value.unreadCount === "number") return value.unreadCount
  return 0
}

function formatProjectSummary(project: SessionContextRecord["projects"][number]): string {
  const parts: string[] = []
  if (project.taskCount !== undefined) parts.push(formatCount(project.taskCount, "task"))
  if (project.pendingProposalCount !== undefined) parts.push(formatCount(project.pendingProposalCount, "pending proposal"))
  if (parts.length === 0) return `${project.name} is active`
  return `${project.name} has ${joinWithAnd(parts)}`
}

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`
}

function joinWithAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ""
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
