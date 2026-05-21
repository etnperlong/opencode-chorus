import { describe, expect, it } from "bun:test"
import { access, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
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
    expect(result.reviews).toEqual({})
    expect(result.notificationQueue).toEqual([])
  })

  it("drops malformed session context while preserving persisted state", () => {
    const result = migrateOpenCodeState({
      mainSession: { status: "active", runtimeSessionId: "runtime-1" },
      reviews: { current: { currentRound: 1, maxRounds: 1, status: "reviewing", blockersSnapshot: [] } },
      sessionContext: "not-an-object",
    })

    expect(result.mainSession.status).toBe("idle")
    expect(result.reviews.current?.status).toBe("reviewing")
    expect(result.sessionContext).toBeUndefined()
  })

  it("drops object-shaped session context without required fields", () => {
    const result = migrateOpenCodeState({
      mainSession: { status: "active", runtimeSessionId: "runtime-1" },
      sessionContext: {},
    })

    expect(result.mainSession.status).toBe("idle")
    expect(result.sessionContext).toBeUndefined()
  })

  it("does not preserve transient lazy bridge status in persisted state", () => {
    const result = migrateOpenCodeState({
      lazyBridge: {
        status: "connected",
        toolCount: 12,
        chorusUrl: "http://localhost:8637",
        inputSchema: { should: "not be required or persisted by bridge" },
      },
    })

    expect(result.lazyBridge).toBeUndefined()
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
        reviews: {
          ...state.reviews,
          first: {
            currentRound: 1,
            maxRounds: 1,
            status: "reviewing",
            blockersSnapshot: [],
          },
        },
      })),
      second.updateOpenCodeState((state) => ({
        ...state,
        reviews: {
          ...state.reviews,
          second: {
            currentRound: 1,
            maxRounds: 1,
            status: "reviewing",
            blockersSnapshot: [],
          },
        },
      })),
    ])

    const result = await first.readOpenCodeState()

    expect(Object.keys(result.reviews).sort()).toEqual(["first", "second"])
  })

  it("creates state files lazily on first write without init", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "chorus-state-"))
    const store = new StateStore(projectRoot, ".chorus")

    await store.updateOpenCodeState((state) => ({
      ...state,
      mainSession: {
        ...state.mainSession,
        status: "active",
      },
    }))

    const result = await store.readOpenCodeState()

    expect(result.mainSession.status).toBe("active")
  })

  it("does not create state directories for global runtime-only updates", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "chorus-project-"))
    const globalRoot = await mkdtemp(join(tmpdir(), "chorus-global-"))
    const store = new StateStore({ projectRoot, stateMode: "global", globalStateRoot: globalRoot })

    await store.init()
    await store.updateOpenCodeState((state) => ({
      ...state,
      mainSession: { runtimeSessionId: "runtime-1", status: "active" },
      lazyBridge: { status: "connected", toolCount: 4 },
      notificationRuntime: { status: "connected" },
    }))

    expect(await exists(join(projectRoot, ".chorus"))).toBe(false)
    expect(await exists(store.paths.rootDir)).toBe(false)
    expect(await exists(store.paths.stateFile)).toBe(false)
  })

  it("persists only reviews, notification queue, and project metadata", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "chorus-project-"))
    const globalRoot = await mkdtemp(join(tmpdir(), "chorus-global-"))
    const store = new StateStore({
      projectRoot,
      worktree: projectRoot,
      stateMode: "global",
      globalStateRoot: globalRoot,
    })

    await store.updateOpenCodeState((state) => ({
      ...state,
      mainSession: { runtimeSessionId: "runtime-1", status: "active" },
      sessionContext: {
        source: "chorus_checkin",
        runtimeSessionId: "runtime-1",
        lastRefreshedAt: "2026-01-01T00:00:00.000Z",
        projects: [],
      },
      lazyBridge: { status: "connected", toolCount: 4 },
      notificationRuntime: { status: "connected" },
      reviews: {
        "task:task-1": {
          currentRound: 1,
          maxRounds: 3,
          status: "reviewing",
          blockersSnapshot: [],
        },
      },
      notificationQueue: [
        {
          id: "notif-1",
          notificationUuid: "notif-1",
          kind: "task_assigned",
          delivery: "context_only",
          title: "Task assigned",
          toastMessage: "Task assigned",
          prompt: "Review task.",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          attempts: 0,
          status: "pending",
        },
      ],
    }))

    const raw = JSON.parse(await readFile(store.paths.stateFile, "utf8"))

    expect(raw.reviews["task:task-1"].status).toBe("reviewing")
    expect(raw.notificationQueue).toHaveLength(1)
    expect(raw.project).toMatchObject({ canonicalDirectory: projectRoot, worktree: projectRoot })
    expect(raw.mainSession).toBeUndefined()
    expect(raw.sessionContext).toBeUndefined()
    expect(raw.lazyBridge).toBeUndefined()
    expect(raw.notificationRuntime).toBeUndefined()
    expect(raw.workers).toBeUndefined()
    expect(raw.checkpoints).toBeUndefined()
  })

  it("restores persisted reviews and notification queue without runtime session state", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "chorus-project-"))
    const globalRoot = await mkdtemp(join(tmpdir(), "chorus-global-"))
    const first = new StateStore({ projectRoot, stateMode: "global", globalStateRoot: globalRoot })

    await first.updateOpenCodeState((state) => ({
      ...state,
      mainSession: { runtimeSessionId: "runtime-before-restart", status: "active" },
      reviews: {
        "proposal:proposal-1": {
          currentRound: 1,
          maxRounds: 3,
          status: "approved",
          lastVerdict: "PASS",
          blockersSnapshot: [],
        },
      },
      notificationQueue: [
        {
          id: "notif-1",
          notificationUuid: "notif-1",
          kind: "task_verified",
          delivery: "assistant_turn",
          title: "Task verified",
          toastMessage: "Task verified",
          prompt: "Review next task.",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          attempts: 0,
          status: "pending",
        },
      ],
    }))

    const restarted = new StateStore({ projectRoot, stateMode: "global", globalStateRoot: globalRoot })
    const state = await restarted.readOpenCodeState()

    expect(state.reviews["proposal:proposal-1"]?.lastVerdict).toBe("PASS")
    expect(state.notificationQueue[0]?.notificationUuid).toBe("notif-1")
    expect(state.mainSession.status).toBe("idle")
    expect(state.mainSession.runtimeSessionId).toBeUndefined()
  })

  it("persists shared workspace context in global state", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "chorus-project-"))
    const globalRoot = await mkdtemp(join(tmpdir(), "chorus-global-"))
    const first = new StateStore({ projectRoot, stateMode: "global", globalStateRoot: globalRoot })

    await first.updateSharedState((state) => ({
      ...state,
      context: { ...state.context, projectUuid: "project-1", projectName: "OpenCode-Chorus" },
    }))

    const raw = JSON.parse(await readFile(first.paths.sharedFile, "utf8"))
    const second = new StateStore({ projectRoot, stateMode: "global", globalStateRoot: globalRoot })
    const shared = await second.readSharedState()

    expect(raw.context.projectUuid).toBe("project-1")
    expect(raw.context.projectName).toBe("OpenCode-Chorus")
    expect(shared.context.projectUuid).toBe("project-1")
    expect(shared.context.projectName).toBe("OpenCode-Chorus")
  })

  it("migrates legacy project state to global storage and cleans known files", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "chorus-project-"))
    const globalRoot = await mkdtemp(join(tmpdir(), "chorus-global-"))
    const legacyRoot = join(projectRoot, ".chorus")
    await mkdir(legacyRoot, { recursive: true })
    await writeFile(
      join(legacyRoot, "opencode-state.json"),
      JSON.stringify({
        version: 1,
        runtime: "opencode",
        updatedAt: "2026-01-01T00:00:00.000Z",
        sessionContext: {
          source: "chorus_checkin",
          runtimeSessionId: "runtime-legacy",
          lastRefreshedAt: "2026-01-01T00:00:00.000Z",
          projects: [],
        },
        reviews: {
          "proposal:proposal-1": {
            currentRound: 1,
            maxRounds: 3,
            status: "approved",
            blockersSnapshot: [],
          },
        },
        notificationQueue: [
          {
            id: "notif-1",
            notificationUuid: "notif-1",
            kind: "proposal_rejected",
            delivery: "assistant_turn",
            title: "Proposal rejected",
            toastMessage: "Proposal rejected",
            prompt: "Review proposal.",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            attempts: 0,
            status: "pending",
          },
        ],
      }),
      "utf8",
    )
    await writeFile(join(legacyRoot, "shared.json"), "{}", "utf8")

    const store = new StateStore({ projectRoot, stateMode: "global", globalStateRoot: globalRoot })
    await store.init()

    const state = await store.readOpenCodeState()
    const raw = JSON.parse(await readFile(store.paths.stateFile, "utf8"))

    expect(state.reviews["proposal:proposal-1"]?.status).toBe("approved")
    expect(state.notificationQueue).toHaveLength(1)
    expect(state.sessionContext).toBeUndefined()
    expect(raw.sessionContext).toBeUndefined()
    expect(await exists(legacyRoot)).toBe(false)
  })

  it("migrates from .chorus in global mode even when stateDir is configured", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "chorus-project-"))
    const globalRoot = await mkdtemp(join(tmpdir(), "chorus-global-"))
    const legacyRoot = join(projectRoot, ".chorus")
    const customRoot = join(projectRoot, ".custom-chorus")
    await mkdir(legacyRoot, { recursive: true })
    await mkdir(customRoot, { recursive: true })
    await writeFile(
      join(legacyRoot, "opencode-state.json"),
      JSON.stringify({
        reviews: {
          "task:from-chorus": {
            currentRound: 1,
            maxRounds: 3,
            status: "approved",
            blockersSnapshot: [],
          },
        },
      }),
      "utf8",
    )
    await writeFile(
      join(customRoot, "opencode-state.json"),
      JSON.stringify({
        reviews: {
          "task:from-custom": {
            currentRound: 1,
            maxRounds: 3,
            status: "changes-requested",
            blockersSnapshot: [],
          },
        },
      }),
      "utf8",
    )

    const store = new StateStore({
      projectRoot,
      stateMode: "global",
      stateDir: ".custom-chorus",
      globalStateRoot: globalRoot,
    })
    await store.init()

    const state = await store.readOpenCodeState()

    expect(state.reviews["task:from-chorus"]?.status).toBe("approved")
    expect(state.reviews["task:from-custom"]).toBeUndefined()
    expect(await exists(join(customRoot, "opencode-state.json"))).toBe(true)
  })

  it("falls back to project-local state when global storage cannot be initialized", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "chorus-project-"))
    const globalRootFile = join(await mkdtemp(join(tmpdir(), "chorus-global-parent-")), "not-a-directory")
    await writeFile(globalRootFile, "not a directory", "utf8")
    const store = new StateStore({ projectRoot, stateMode: "global", globalStateRoot: globalRootFile })

    await store.updateOpenCodeState((state) => ({
      ...state,
      reviews: {
        "task:task-1": {
          currentRound: 1,
          maxRounds: 3,
          status: "reviewing",
          blockersSnapshot: [],
        },
      },
    }))

    expect(store.paths.mode).toBe("project")
    expect(store.fallbackReason).toBeDefined()
    expect(await exists(join(projectRoot, ".chorus", "opencode-state.json"))).toBe(true)
  })

  it("falls back to project-local state when a global read fails before writes", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "chorus-project-"))
    const globalRootFile = join(await mkdtemp(join(tmpdir(), "chorus-global-parent-")), "not-a-directory")
    await writeFile(globalRootFile, "not a directory", "utf8")
    const store = new StateStore({ projectRoot, stateMode: "global", globalStateRoot: globalRootFile })

    const state = await store.readOpenCodeState()

    expect(state.mainSession.status).toBe("idle")
    expect(store.paths.mode).toBe("project")
    expect(store.paths.rootDir).toBe(join(projectRoot, ".chorus"))
    expect(store.fallbackReason).toBeDefined()
  })
})

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
