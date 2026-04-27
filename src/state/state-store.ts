import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createDefaultSharedState, migrateOpenCodeState, migrateSharedState } from "./migrations"
import { resolveChorusPaths, type ChorusPaths } from "./paths"
import type { OpenCodeState, SharedState } from "./state-types"

export class StateStore {
  private queue = Promise.resolve()
  readonly paths: ChorusPaths

  constructor(projectRoot: string, stateDir: string) {
    this.paths = resolveChorusPaths(projectRoot, stateDir)
  }

  async init(): Promise<void> {
    await mkdir(this.paths.rootDir, { recursive: true })
    await mkdir(this.paths.sessionsDir, { recursive: true })
    await mkdir(this.paths.locksDir, { recursive: true })
    await this.updateOpenCodeState((state) => state)
    await this.updateSharedState((state) => state)
  }

  async readOpenCodeState(): Promise<OpenCodeState> {
    try {
      const raw = await readFile(this.paths.stateFile, "utf8")
      return migrateOpenCodeState(JSON.parse(raw))
    } catch (error) {
      if (isMissingFileError(error)) return migrateOpenCodeState(null)
      throw error
    }
  }

  async updateOpenCodeState(updater: (state: OpenCodeState) => OpenCodeState): Promise<OpenCodeState> {
    return this.enqueue(async () => {
      return this.withLock("opencode-state", async () => {
        const current = await this.readOpenCodeState()
        const next = updater({ ...current, updatedAt: new Date().toISOString() })
        await this.atomicWrite(this.paths.stateFile, JSON.stringify(next, null, 2))
        return next
      })
    })
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
    const tempPath = join(this.paths.rootDir, `.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}.json`)
    await writeFile(tempPath, contents, "utf8")
    await rename(tempPath, filePath)
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

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}

function isFileExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST"
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
