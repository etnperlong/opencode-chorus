export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function extractStringField(value: unknown, field: string): string | undefined {
  if (!isRecord(value)) return undefined
  const raw = value[field]
  return typeof raw === "string" && raw.length > 0 ? raw : undefined
}
