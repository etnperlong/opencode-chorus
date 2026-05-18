// Auto-approval hook for safe Chorus staging file edits.
// It only allows write/edit operations that target the managed staging directory.

import path from "node:path"

type PermissionAskInput = {
  type?: unknown
  pattern?: unknown
  title?: unknown
  metadata?: unknown
}

type PermissionAskOutput = {
  status: "ask" | "deny" | "allow"
}

const EDIT_PERMISSION_TYPES = new Set(["edit", "write"])
const FILE_EDIT_TOOLS = new Set(["edit", "write"])

export function createPermissionAskHook(options: { stagingDir?: string }) {
  const stagingDir = options.stagingDir ? path.resolve(options.stagingDir) : undefined

  return async (input: PermissionAskInput, output: PermissionAskOutput): Promise<void> => {
    if (!stagingDir || !targetsEditableOperation(input)) return
    if (!extractPathCandidates(input).some((candidate) => isStagingPathCandidate(candidate, stagingDir))) return
    output.status = "allow"
  }
}

function targetsEditableOperation(input: PermissionAskInput): boolean {
  if (typeof input.type === "string" && EDIT_PERMISSION_TYPES.has(input.type)) return true
  if (input.type !== "tool") return false

  const metadata = readRecord(input.metadata)
  return typeof metadata?.tool === "string" && FILE_EDIT_TOOLS.has(metadata.tool)
}

function extractPathCandidates(input: PermissionAskInput): string[] {
  const metadata = readRecord(input.metadata)
  const args = readRecord(metadata?.args)

  return [
    ...collectStringValues(input.pattern),
    ...collectStringValues(input.title),
    ...collectStringValues(metadata?.pattern),
    ...collectStringValues(metadata?.path),
    ...collectStringValues(metadata?.file),
    ...collectStringValues(metadata?.filePath),
    ...collectStringValues(metadata?.target),
    ...collectStringValues(metadata?.destination),
    ...collectStringValues(metadata?.paths),
    ...collectStringValues(args?.path),
    ...collectStringValues(args?.file),
    ...collectStringValues(args?.filePath),
    ...collectStringValues(args?.target),
    ...collectStringValues(args?.destination),
  ]
}

function collectStringValues(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function isStagingPathCandidate(candidate: string, stagingDir: string): boolean {
  if (candidate.includes(stagingDir)) return true
  if (!looksLikePath(candidate)) return false

  const resolved = path.resolve(candidate)
  const relative = path.relative(stagingDir, resolved)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function looksLikePath(candidate: string): boolean {
  return candidate.includes("/") || candidate.includes("\\") || candidate.startsWith(".")
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
