import { mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  createDefaultRuntimeState,
  createDefaultSharedState,
  extractRuntimeOpenCodeState,
  hasPersistedOpenCodeChanges,
  mergeOpenCodeState,
  migrateOpenCodeState,
  migrateSharedState,
  serializeOpenCodeState,
  type RuntimeOpenCodeState,
} from "./migrations"
import { resolveChorusPaths, resolveStatePaths, type ChorusPaths, type StateMode } from "./paths"
import type { OpenCodeState, SharedState } from "./state-types"

export type StateStoreOptions = {
  projectRoot: string
  worktree?: string
  stateMode?: StateMode
  stateDir?: string
  globalStateRoot?: string
}

export class StateStore {
  private queue = Promise.resolve()
  private runtimeState: RuntimeOpenCodeState = createDefaultRuntimeState()
  private readonly options: Required<Pick<StateStoreOptions, "projectRoot" | "stateDir">> & Omit<StateStoreOptions, "projectRoot" | "stateDir">
  paths: ChorusPaths
  fallbackReason?: string

  constructor(projectRoot: string, stateDir: string)
  constructor(options: StateStoreOptions)
  constructor(projectRootOrOptions: string | StateStoreOptions, stateDir = ".chorus") {
    this.options =
      typeof projectRootOrOptions === "string"
        ? { projectRoot: projectRootOrOptions, stateDir, stateMode: "project" }
        : { stateDir: ".chorus", ...projectRootOrOptions }
    this.paths =
      typeof projectRootOrOptions === "string"
        ? resolveChorusPaths(projectRootOrOptions, stateDir)
        : resolveStatePaths(this.options)
  }

  async init(): Promise<void> {
    if (this.paths.mode !== "global") return
    try {
      await this.migrateLegacyProjectState()
    } catch (error) {
      await this.fallbackToProjectLocal(error)
    }
  }

  async ensureStagingDir(): Promise<void> {
    await mkdir(this.paths.stagingDir, { recursive: true }).catch(() => {})
  }

  async cleanupStagingDir(): Promise<void> {
    await rm(this.paths.stagingDir, { recursive: true, force: true }).catch(() => {})
  }

  usesProjectLocalState(): boolean {
    return this.paths.mode === "project"
  }

  async readOpenCodeState(): Promise<OpenCodeState> {
    try {
      const persisted = await this.readPersistedOpenCodeState(this.paths.stateFile)
      return mergeOpenCodeState(persisted, this.runtimeState)
    } catch (error) {
      if (this.paths.mode === "global" && isStorageError(error)) {
        await this.fallbackToProjectLocal(error)
        const persisted = await this.readPersistedOpenCodeState(this.paths.stateFile)
        return mergeOpenCodeState(persisted, this.runtimeState)
      }
      throw error
    }
  }

  private async readPersistedOpenCodeState(filePath: string): Promise<OpenCodeState> {
    try {
      const raw = await readFile(filePath, "utf8")
      return migrateOpenCodeState(JSON.parse(raw), this.paths.project)
    } catch (error) {
      if (isMissingFileError(error)) return migrateOpenCodeState(null, this.paths.project)
      throw error
    }
  }

  async updateOpenCodeState(updater: (state: OpenCodeState) => OpenCodeState): Promise<OpenCodeState> {
    return this.enqueue(() => this.runOpenCodeStateUpdate(updater, true))
  }

  private async runOpenCodeStateUpdate(
    updater: (state: OpenCodeState) => OpenCodeState,
    allowFallback: boolean,
  ): Promise<OpenCodeState> {
    try {
      if (this.paths.mode === "global" && !(await fileExists(this.paths.stateFile))) {
        const current = mergeOpenCodeState(migrateOpenCodeState(null, this.paths.project), this.runtimeState)
        const next = updater({ ...current, updatedAt: new Date().toISOString() })
        if (!hasPersistedOpenCodeChanges(current, next)) {
          this.runtimeState = extractRuntimeOpenCodeState(next)
          return next
        }
      }

      return await this.withLock("opencode-state", async () => {
        const persisted = await this.readPersistedOpenCodeState(this.paths.stateFile)
        const current = mergeOpenCodeState(persisted, this.runtimeState)
        const next = updater({ ...current, updatedAt: new Date().toISOString() })
        this.runtimeState = extractRuntimeOpenCodeState(next)
        if (hasPersistedOpenCodeChanges(current, next)) {
          await this.writePersistedOpenCodeState(next)
        }
        return next
      })
    } catch (error) {
      if (allowFallback && this.paths.mode === "global" && isStorageError(error)) {
        await this.fallbackToProjectLocal(error)
        return this.runOpenCodeStateUpdate(updater, false)
      }
      throw error
    }
  }

  async readSharedState(): Promise<SharedState> {
    try {
      const raw = await readFile(this.paths.sharedFile, "utf8")
      return migrateSharedState(JSON.parse(raw))
    } catch (error) {
      if (isMissingFileError(error)) return createDefaultSharedState()
      throw error
    }
  }

  async updateSharedState(updater: (state: SharedState) => SharedState): Promise<SharedState> {
    if (this.paths.mode === "global") return updater(createDefaultSharedState())
    return this.enqueue(async () => {
      return this.withLock("shared-state", async () => {
        const current = await this.readSharedState()
        const next = updater(current)
        await this.atomicWrite(this.paths.sharedFile, JSON.stringify(next, null, 2))
        return next
      })
    })
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.queue.then(job)
    this.queue = next.then(() => undefined, () => undefined)
    return next
  }

  private async atomicWrite(filePath: string, contents: string): Promise<void> {
    await mkdir(this.paths.rootDir, { recursive: true })
    const tempPath = join(this.paths.rootDir, `.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}.json`)
    await writeFile(tempPath, contents, "utf8")
    await rename(tempPath, filePath)
  }

  private async writePersistedOpenCodeState(state: OpenCodeState): Promise<void> {
    const contents = JSON.stringify(serializeOpenCodeState(state, this.paths.project), null, 2)
    await this.atomicWrite(this.paths.stateFile, contents)
  }

  private async migrateLegacyProjectState(): Promise<void> {
    if (await fileExists(this.paths.stateFile)) return
    if (!(await fileExists(this.paths.legacyProjectStateFile))) return

    const raw = await readFile(this.paths.legacyProjectStateFile, "utf8")
    const migratedProject = {
      ...this.paths.project,
      migratedFrom: this.paths.legacyProjectStateFile,
      migratedAt: new Date().toISOString(),
    }
    const migrated = migrateOpenCodeState(JSON.parse(raw), migratedProject)
    await this.atomicWrite(this.paths.stateFile, JSON.stringify(serializeOpenCodeState(migrated, migratedProject), null, 2))
    await this.readPersistedOpenCodeState(this.paths.stateFile)
    await this.cleanupLegacyProjectState()
  }

  private async cleanupLegacyProjectState(): Promise<void> {
    await rm(this.paths.legacyProjectStateFile, { force: true })
    await rm(this.paths.legacyProjectSharedFile, { force: true })
    await rm(this.paths.legacyProjectClaudeStateFile, { force: true })
    await rm(join(this.paths.legacyProjectSessionsDir, "main.json"), { force: true })

    for (const dir of [
      this.paths.legacyProjectSessionsDir,
      join(this.paths.legacyProjectRootDir, "locks"),
      join(this.paths.legacyProjectRootDir, "workers"),
      join(this.paths.legacyProjectRootDir, "checkpoints"),
      this.paths.legacyProjectRootDir,
    ]) {
      await removeDirectoryIfEmpty(dir)
    }
  }

  private async fallbackToProjectLocal(error: unknown): Promise<void> {
    this.fallbackReason = error instanceof Error ? error.message : String(error)
    const stateDir = this.options.stateMode === "project" ? this.options.stateDir : ".chorus"
    this.paths = resolveChorusPaths(this.options.projectRoot, stateDir)
    this.runtimeState = createDefaultRuntimeState()
  }

  private async withLock<T>(name: string, job: () => Promise<T>): Promise<T> {
    const lockPath = join(this.paths.locksDir, `${name}.lock`)
    await this.acquireLock(lockPath)
    try {
      return await job()
    } finally {
      await rm(lockPath, { recursive: true, force: true })
    }
  }

  private async acquireLock(lockPath: string): Promise<void> {
    await mkdir(this.paths.locksDir, { recursive: true })
    while (true) {
      try {
        await mkdir(lockPath)
        return
      } catch (error) {
        if (!isFileExistsError(error)) throw error
        await sleep(5)
      }
    }
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath, "utf8")
    return true
  } catch (error) {
    if (isMissingFileError(error)) return false
    throw error
  }
}

async function removeDirectoryIfEmpty(dir: string): Promise<void> {
  try {
    await rmdir(dir)
  } catch (error) {
    if (isMissingFileError(error) || isDirectoryNotEmptyError(error)) return
    throw error
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}

function isDirectoryNotEmptyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error.code === "ENOTEMPTY" || error.code === "EEXIST")
}

function isStorageError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false
  return ["EACCES", "EEXIST", "ENOENT", "ENOTDIR", "EPERM", "EROFS"].includes(String(error.code))
}

function isFileExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST"
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
