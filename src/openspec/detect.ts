import { stat } from "node:fs/promises"
import { join } from "node:path"

export type OpenSpecAvailability = {
  hasDirectory: boolean
  hasCli: boolean
  available: boolean
}

export async function hasOpenSpecDirectory(projectRoot: string): Promise<boolean> {
  try {
    return (await stat(join(projectRoot, "openspec"))).isDirectory()
  } catch (error) {
    if (isMissingPathError(error)) return false
    throw error
  }
}

export async function detectOpenSpecAvailability(projectRoot: string, checkCli: () => Promise<boolean>): Promise<OpenSpecAvailability> {
  const [hasDirectory, hasCli] = await Promise.all([hasOpenSpecDirectory(projectRoot), checkCli()])
  return {
    hasDirectory,
    hasCli,
    available: hasDirectory && hasCli,
  }
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}
