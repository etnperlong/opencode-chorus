import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { buildSessionFile, deleteSessionFile } from "../../src/state/session-files"

describe("buildSessionFile", () => {
  it("adds shared fields and opencode extensions", () => {
    const result = buildSessionFile({
      sessionUuid: "s-1",
      agentName: "main",
      agentType: "main",
      chorusUrl: "http://localhost:8637",
      runtimeSessionId: "r-1",
      workerKind: "main",
    })

    expect(result.runtime).toBe("opencode")
    expect(result.sessionUuid).toBe("s-1")
  })
})

describe("deleteSessionFile", () => {
  it("ignores missing session files", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-"))
    const sessionsDir = join(rootDir, "sessions")
    await mkdir(sessionsDir)

    try {
      await expect(deleteSessionFile(pathsFor(rootDir), "missing")).resolves.toBeUndefined()
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("rethrows unexpected unlink failures", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-"))
    const sessionsDir = join(rootDir, "sessions")
    await mkdir(join(sessionsDir, "main.json"), { recursive: true })

    try {
      await expect(deleteSessionFile(pathsFor(rootDir), "main")).rejects.toThrow()
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})

function pathsFor(rootDir: string) {
  return {
    rootDir,
    stateFile: join(rootDir, "opencode-state.json"),
    sharedFile: join(rootDir, "shared.json"),
    legacyClaudeStateFile: join(rootDir, "state.json"),
    sessionsDir: join(rootDir, "sessions"),
    locksDir: join(rootDir, "locks"),
  }
}
