import { join } from "node:path"

export type ChorusPaths = {
  rootDir: string
  stateFile: string
  sharedFile: string
  legacyClaudeStateFile: string
  sessionsDir: string
  locksDir: string
}

export function resolveChorusPaths(projectRoot: string, stateDir: string): ChorusPaths {
  const rootDir = join(projectRoot, stateDir)
  return {
    rootDir,
    stateFile: join(rootDir, "opencode-state.json"),
    sharedFile: join(rootDir, "shared.json"),
    legacyClaudeStateFile: join(rootDir, "state.json"),
    sessionsDir: join(rootDir, "sessions"),
    locksDir: join(rootDir, "locks"),
  }
}
