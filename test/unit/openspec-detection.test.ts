import { describe, expect, it } from "bun:test"
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { detectOpenSpecAvailability, hasOpenSpecDirectory, isOpenSpecCliAvailable } from "../../src/openspec"

describe("OpenSpec detection", () => {
  it("detects an openspec directory in the project root", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-openspec-"))

    try {
      expect(await hasOpenSpecDirectory(rootDir)).toBe(false)

      await mkdir(join(rootDir, "openspec"))


      expect(await hasOpenSpecDirectory(rootDir)).toBe(true)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("detects whether the openspec CLI can be launched", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-openspec-"))
    const cliPath = join(rootDir, "openspec")

    try {
      await writeFile(cliPath, "#!/usr/bin/env sh\nexit 0\n", "utf8")
      await chmod(cliPath, 0o755)

      expect(await isOpenSpecCliAvailable({ command: cliPath, timeoutMs: 1_000 })).toBe(true)
      expect(await isOpenSpecCliAvailable({ command: join(rootDir, "missing-openspec"), timeoutMs: 1_000 })).toBe(false)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it("requires both directory and CLI for availability", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opencode-chorus-openspec-"))

    try {
      expect(await detectOpenSpecAvailability(rootDir, async () => true)).toEqual({
        hasDirectory: false,
        hasCli: true,
        available: false,
      })

      await mkdir(join(rootDir, "openspec"))

      expect(await detectOpenSpecAvailability(rootDir, async () => true)).toEqual({
        hasDirectory: true,
        hasCli: true,
        available: true,
      })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
