import { describe, expect, it } from "bun:test"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { migrateOpenCodeState, migrateSharedState } from "../../src/state/migrations"
import { StateStore } from "../../src/state/state-store"

describe("migrateOpenCodeState", () => {
  it("creates a default v1 state", () => {
    const result = migrateOpenCodeState(null)

    expect(result.version).toBe(1)
    expect(result.runtime).toBe("opencode")
    expect(result.planningScopes).toEqual({})
  })
})

describe("migrateSharedState", () => {
  it("creates a default v1 shared state", () => {
    const result = migrateSharedState({})

    expect(result.version).toBe(1)
    expect(result.context).toEqual({})
    expect(result.orphanHints).toEqual([])
  })
})

describe("StateStore", () => {
  it("rejects corrupt opencode state instead of defaulting", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "chorus-state-"))
    await mkdir(join(projectRoot, ".chorus"), { recursive: true })
    await writeFile(join(projectRoot, ".chorus", "opencode-state.json"), "{", "utf8")

    const store = new StateStore(projectRoot, ".chorus")

    await expect(store.readOpenCodeState()).rejects.toThrow()
  })

  it("preserves concurrent updates from independent store instances", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "chorus-state-"))
    const first = new StateStore(projectRoot, ".chorus")
    const second = new StateStore(projectRoot, ".chorus")
    await first.init()

    await Promise.all([
      first.updateOpenCodeState((state) => ({
        ...state,
        workers: {
          ...state.workers,
          first: {
            kind: "worker",
            status: "running",
            runtimeSessionId: "first-session",
            startedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      })),
      second.updateOpenCodeState((state) => ({
        ...state,
        workers: {
          ...state.workers,
          second: {
            kind: "worker",
            status: "running",
            runtimeSessionId: "second-session",
            startedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      })),
    ])

    const result = await first.readOpenCodeState()

    expect(Object.keys(result.workers).sort()).toEqual(["first", "second"])
  })
})
