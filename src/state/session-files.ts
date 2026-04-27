import { unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { ChorusPaths } from "./paths"

export type SessionFileInput = {
  sessionUuid: string
  agentName: string
  agentType: string
  chorusUrl: string
  runtimeSessionId: string
  workerKind: string
  targetType?: string
  targetUuid?: string
}

export function buildSessionFile(input: SessionFileInput) {
  return {
    sessionUuid: input.sessionUuid,
    agentName: input.agentName,
    agentType: input.agentType,
    chorusUrl: input.chorusUrl,
    createdAt: new Date().toISOString(),
    runtime: "opencode",
    runtimeSessionId: input.runtimeSessionId,
    workerKind: input.workerKind,
    targetType: input.targetType,
    targetUuid: input.targetUuid,
  }
}

export async function writeSessionFile(paths: ChorusPaths, name: string, input: SessionFileInput) {
  await writeFile(join(paths.sessionsDir, `${name}.json`), JSON.stringify(buildSessionFile(input), null, 2), "utf8")
}

export async function deleteSessionFile(paths: ChorusPaths, name: string) {
  try {
    await unlink(join(paths.sessionsDir, `${name}.json`))
  } catch (error) {
    if (isMissingFileError(error)) return
    throw error
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}
