import type { ChorusMcpScope } from "./mcp-config"

export type ChorusToolScope = ChorusMcpScope

type SharedStateReader = {
  readSharedState?(): Promise<{ context?: { projectUuid?: string; projectGroupUuid?: string } }>
}

export async function resolveChorusToolScope(
  stateStore: SharedStateReader | undefined,
): Promise<ChorusToolScope | undefined> {
  const sharedState = await stateStore?.readSharedState?.()
  const projectGroupUuid = normalizeString(sharedState?.context?.projectGroupUuid)
  if (projectGroupUuid) return { projectGroupUuid }

  const projectUuid = normalizeString(sharedState?.context?.projectUuid)
  return projectUuid ? { projectUuid } : undefined
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}
