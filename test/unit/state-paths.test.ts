import { describe, expect, it } from "bun:test"
import { resolveStatePaths } from "../../src/state/paths"

describe("resolveStatePaths", () => {
  it("uses XDG_STATE_HOME for Linux global state", () => {
    const paths = resolveStatePaths({
      projectRoot: "/workspace/Repo",
      worktree: "/workspace/Repo",
      stateMode: "global",
      env: { XDG_STATE_HOME: "/var/state" },
      homeDir: "/home/alice",
      platform: "linux",
    })

    expect(paths.mode).toBe("global")
    expect(paths.globalRootDir).toBe("/var/state/opencode/chorus")
    expect(paths.project.canonicalDirectory).toBe("/workspace/Repo")
    expect(paths.project.worktree).toBe("/workspace/Repo")
    expect(paths.rootDir).toMatch(/^\/var\/state\/opencode\/chorus\/Repo-[a-f0-9]{12}$/)
    expect(paths.stagingDir).toBe(`${paths.rootDir}/staging`)
    expect(paths.stateFile).toBe(`${paths.rootDir}/opencode-state.json`)
  })

  it("uses platform defaults for macOS and Windows global state", () => {
    const mac = resolveStatePaths({
      projectRoot: "/Users/alice/src/app",
      stateMode: "global",
      env: {},
      homeDir: "/Users/alice",
      platform: "darwin",
    })
    const windows = resolveStatePaths({
      projectRoot: "C:\\Users\\Alice\\src\\app",
      stateMode: "global",
      env: { LOCALAPPDATA: "C:\\Users\\Alice\\AppData\\Local" },
      homeDir: "C:\\Users\\Alice",
      platform: "win32",
    })

    expect(mac.globalRootDir).toBe("/Users/alice/Library/Application Support/OpenCode/Chorus")
    expect(windows.globalRootDir).toBe("C:\\Users\\Alice\\AppData\\Local\\OpenCode\\Chorus")
  })

  it("derives stable project keys from canonical paths", () => {
    const first = resolveStatePaths({
      projectRoot: "/workspace/app/./",
      stateMode: "global",
      env: { XDG_STATE_HOME: "/state" },
      homeDir: "/home/alice",
      platform: "linux",
    })
    const second = resolveStatePaths({
      projectRoot: "/workspace/app",
      stateMode: "global",
      env: { XDG_STATE_HOME: "/state" },
      homeDir: "/home/alice",
      platform: "linux",
    })
    const other = resolveStatePaths({
      projectRoot: "/workspace/other-app",
      stateMode: "global",
      env: { XDG_STATE_HOME: "/state" },
      homeDir: "/home/alice",
      platform: "linux",
    })

    expect(first.project.projectKey).toBe(second.project.projectKey)
    expect(first.rootDir).toBe(second.rootDir)
    expect(first.project.projectKey).not.toBe(other.project.projectKey)
  })

  it("normalizes Windows project paths case-insensitively", () => {
    const first = resolveStatePaths({
      projectRoot: "C:\\Users\\Alice\\src\\App",
      stateMode: "global",
      env: { LOCALAPPDATA: "C:\\state" },
      homeDir: "C:\\Users\\Alice",
      platform: "win32",
    })
    const second = resolveStatePaths({
      projectRoot: "c:/users/alice/src/app/",
      stateMode: "global",
      env: { LOCALAPPDATA: "C:\\state" },
      homeDir: "C:\\Users\\Alice",
      platform: "win32",
    })

    expect(first.project.canonicalDirectory).toBe("c:\\users\\alice\\src\\app")
    expect(first.project.projectKey).toBe(second.project.projectKey)
    expect(first.rootDir).toBe(second.rootDir)
  })

  it("keeps explicit project-local mode under stateDir", () => {
    const paths = resolveStatePaths({
      projectRoot: "/workspace/app",
      stateMode: "project",
      stateDir: ".custom-chorus",
      env: { XDG_STATE_HOME: "/state" },
      homeDir: "/home/alice",
      platform: "linux",
    })

    expect(paths.mode).toBe("project")
    expect(paths.rootDir).toBe("/workspace/app/.custom-chorus")
    expect(paths.globalRootDir).toBeUndefined()
  })

  it("ignores stateDir for global legacy migration paths", () => {
    const paths = resolveStatePaths({
      projectRoot: "/workspace/app",
      stateMode: "global",
      stateDir: ".custom-chorus",
      env: { XDG_STATE_HOME: "/state" },
      homeDir: "/home/alice",
      platform: "linux",
    })

    expect(paths.legacyProjectRootDir).toBe("/workspace/app/.chorus")
    expect(paths.legacyProjectStateFile).toBe("/workspace/app/.chorus/opencode-state.json")
  })
})
