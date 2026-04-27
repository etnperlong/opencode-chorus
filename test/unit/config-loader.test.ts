import { describe, expect, it } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadChorusConfig, resolveOpenCodeConfigDir } from "../../src/config/config-loader"

describe("config loader", () => {
  it("reads chorus.json from OPENCODE_CONFIG_DIR", async () => {
    const configDir = await mkdtemp(join(tmpdir(), "opencode-config-"))

    try {
      await writeFile(
        join(configDir, "chorus.json"),
        JSON.stringify({
          chorusUrl: "http://chorus-from-file:3000",
          apiKey: "file-key",
          enableTaskReviewer: false,
        }),
      )

      const result = await loadChorusConfig({}, { OPENCODE_CONFIG_DIR: configDir })

      expect(result.config.chorusUrl).toBe("http://chorus-from-file:3000")
      expect(result.config.apiKey).toBe("file-key")
      expect(result.config.enableTaskReviewer).toBe(false)
      expect(result.metadata.apiKeySource).toBe("chorus.json")
    } finally {
      await rm(configDir, { recursive: true, force: true })
    }
  })

  it("tracks numeric apiKey values from chorus.json as file-sourced", async () => {
    const configDir = await mkdtemp(join(tmpdir(), "opencode-config-"))

    try {
      await writeFile(
        join(configDir, "chorus.json"),
        JSON.stringify({ chorusUrl: "http://chorus-from-file:3000", apiKey: 123 }),
      )

      const result = await loadChorusConfig({}, { OPENCODE_CONFIG_DIR: configDir })

      expect(result.config.apiKey).toBe("123")
      expect(result.metadata.apiKeySource).toBe("chorus.json")
    } finally {
      await rm(configDir, { recursive: true, force: true })
    }
  })

  it("falls back to environment variables when chorus.json is missing", async () => {
    const configDir = await mkdtemp(join(tmpdir(), "opencode-config-"))

    try {
      const result = await loadChorusConfig(
        {},
        {
          OPENCODE_CONFIG_DIR: configDir,
          CHORUS_BASE_URL: "http://chorus-from-env:3000",
          CHORUS_API_KEY: "env-key",
        },
      )

      expect(result.config.chorusUrl).toBe("http://chorus-from-env:3000")
      expect(result.config.apiKey).toBe("env-key")
      expect(result.metadata.apiKeySource).toBe("env")
    } finally {
      await rm(configDir, { recursive: true, force: true })
    }
  })

  it("lets environment variables override chorus.json", async () => {
    const configDir = await mkdtemp(join(tmpdir(), "opencode-config-"))

    try {
      await writeFile(
        join(configDir, "chorus.json"),
        JSON.stringify({ chorusUrl: "http://chorus-from-file:3000", apiKey: "file-key" }),
      )

      const result = await loadChorusConfig(
        {},
        {
          OPENCODE_CONFIG_DIR: configDir,
          CHORUS_BASE_URL: "http://chorus-from-env:3000",
          CHORUS_API_KEY: "env-key",
        },
      )

      expect(result.config.chorusUrl).toBe("http://chorus-from-env:3000")
      expect(result.config.apiKey).toBe("env-key")
      expect(result.metadata.apiKeySource).toBe("env")
    } finally {
      await rm(configDir, { recursive: true, force: true })
    }
  })

  it("lets explicit plugin options override environment variables", async () => {
    const configDir = await mkdtemp(join(tmpdir(), "opencode-config-"))

    try {
      const result = await loadChorusConfig(
        { chorusUrl: "http://chorus-from-options:3000", apiKey: "option-key" },
        {
          OPENCODE_CONFIG_DIR: configDir,
          CHORUS_BASE_URL: "http://chorus-from-env:3000",
          CHORUS_API_KEY: "env-key",
        },
      )

      expect(result.config.chorusUrl).toBe("http://chorus-from-options:3000")
      expect(result.config.apiKey).toBe("option-key")
      expect(result.metadata.apiKeySource).toBe("options")
    } finally {
      await rm(configDir, { recursive: true, force: true })
    }
  })

  it("uses CHORUS_URL when CHORUS_BASE_URL is absent", async () => {
    const configDir = await mkdtemp(join(tmpdir(), "opencode-config-"))

    try {
      const result = await loadChorusConfig(
        {},
        {
          OPENCODE_CONFIG_DIR: configDir,
          CHORUS_URL: "http://chorus-alias:3000",
          CHORUS_API_KEY: "env-key",
        },
      )

      expect(result.config.chorusUrl).toBe("http://chorus-alias:3000")
    } finally {
      await rm(configDir, { recursive: true, force: true })
    }
  })

  it("parses comma-separated project UUID environment values", async () => {
    const configDir = await mkdtemp(join(tmpdir(), "opencode-config-"))

    try {
      const result = await loadChorusConfig(
        {},
        {
          OPENCODE_CONFIG_DIR: configDir,
          CHORUS_BASE_URL: "http://chorus:3000",
          CHORUS_API_KEY: "env-key",
          CHORUS_PROJECT_UUIDS: "project-1, project-2,,project-3",
        },
      )

      expect(result.config.projectUuids).toEqual(["project-1", "project-2", "project-3"])
    } finally {
      await rm(configDir, { recursive: true, force: true })
    }
  })

  it("parses boolean and number environment values", async () => {
    const configDir = await mkdtemp(join(tmpdir(), "opencode-config-"))

    try {
      const result = await loadChorusConfig(
        {},
        {
          OPENCODE_CONFIG_DIR: configDir,
          CHORUS_BASE_URL: "http://chorus:3000",
          CHORUS_API_KEY: "env-key",
          CHORUS_AUTO_START: "0",
          CHORUS_ENABLE_PROPOSAL_REVIEWER: "false",
          CHORUS_ENABLE_TASK_REVIEWER: "1",
          CHORUS_MAX_PROPOSAL_REVIEW_ROUNDS: "5",
          CHORUS_MAX_TASK_REVIEW_ROUNDS: "6",
        },
      )

      expect(result.config.autoStart).toBe(false)
      expect(result.config.enableProposalReviewer).toBe(false)
      expect(result.config.enableTaskReviewer).toBe(true)
      expect(result.config.maxProposalReviewRounds).toBe(5)
      expect(result.config.maxTaskReviewRounds).toBe(6)
    } finally {
      await rm(configDir, { recursive: true, force: true })
    }
  })

  it("reports invalid chorus.json with the file path", async () => {
    const configDir = await mkdtemp(join(tmpdir(), "opencode-config-"))
    const configPath = join(configDir, "chorus.json")

    try {
      await writeFile(configPath, "{")

      await expect(loadChorusConfig({}, { OPENCODE_CONFIG_DIR: configDir })).rejects.toThrow(configPath)
    } finally {
      await rm(configDir, { recursive: true, force: true })
    }
  })

  it("resolves XDG_CONFIG_HOME before the default config directory", () => {
    expect(resolveOpenCodeConfigDir({ XDG_CONFIG_HOME: "/tmp/xdg-config", HOME: "/tmp/home" })).toBe(
      "/tmp/xdg-config/opencode",
    )
  })
})
