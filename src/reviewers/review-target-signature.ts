import { createHash } from "node:crypto"

type ReviewTargetType = "proposal" | "task"

const OMITTED_KEYS = new Set([
  "commentCount",
  "comments",
  "createdAt",
  "updatedAt",
  "assignedAt",
  "markedAt",
  "devMarkedAt",
  "lastReviewJobId",
  "lastGateMessage",
  "lastSurfacedAt",
  "lastSurfacedRuntimeSessionId",
])

export function buildReviewTargetSignature(targetType: ReviewTargetType, value: unknown): string {
  const normalized = normalizeValue(value)
  return createHash("sha256").update(`${targetType}:${JSON.stringify(normalized)}`).digest("hex")
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue)
  if (!isRecord(value)) return value

  const normalizedEntries = Object.entries(value)
    .filter(([key]) => !shouldOmitKey(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => [key, normalizeValue(entryValue)] as const)

  return Object.fromEntries(normalizedEntries)
}

function shouldOmitKey(key: string): boolean {
  if (OMITTED_KEYS.has(key)) return true
  return key.endsWith("At")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
