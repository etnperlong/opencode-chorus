import { createHash } from "node:crypto"
import { homedir as defaultHomeDir } from "node:os"
import { posix, win32 } from "node:path"

export type StateMode = "global" | "project"

export type StatePlatform = "linux" | "darwin" | "win32" | NodeJS.Platform

export type ProjectStateMetadata = {
  canonicalDirectory: string
  worktree?: string
  projectKey: string
  projectName: string
  stateMode: StateMode
  migratedFrom?: string
  migratedAt?: string
}

export type ChorusPaths = {
  mode: StateMode
  rootDir: string
  stagingDir: string
  stateFile: string
  sharedFile: string
  legacyClaudeStateFile: string
  sessionsDir: string
  locksDir: string
  project: ProjectStateMetadata
  globalRootDir?: string
  legacyProjectRootDir: string
  legacyProjectStateFile: string
  legacyProjectSharedFile: string
  legacyProjectClaudeStateFile: string
  legacyProjectSessionsDir: string
}

export type ResolveStatePathsOptions = {
  projectRoot: string
  worktree?: string
  stateMode?: StateMode
  stateDir?: string
  globalStateRoot?: string
  env?: Record<string, string | undefined>
  platform?: StatePlatform
  homeDir?: string
}

const DEFAULT_STATE_DIR = ".chorus"

export function resolveChorusPaths(projectRoot: string, stateDir: string): ChorusPaths {
  return resolveStatePaths({ projectRoot, stateDir, stateMode: "project" })
}

export function resolveStatePaths(options: ResolveStatePathsOptions): ChorusPaths {
  const mode = options.stateMode ?? "global"
  const stateDir = mode === "project" ? options.stateDir?.trim() || DEFAULT_STATE_DIR : DEFAULT_STATE_DIR
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const homeDir = options.homeDir ?? defaultHomeDir()
  const pathApi = pathForPlatform(platform)
  const canonicalDirectory = normalizeProjectPath(options.projectRoot, platform, homeDir)
  const worktree = options.worktree ? normalizeProjectPath(options.worktree, platform, homeDir) : undefined
  const projectName = sanitizeProjectSegment(pathApi.basename(canonicalDirectory))
  const projectKey = `${projectName}-${hashProjectPath(platform, canonicalDirectory)}`
  const project: ProjectStateMetadata = {
    canonicalDirectory,
    ...(worktree ? { worktree } : {}),
    projectKey,
    projectName,
    stateMode: mode,
  }
  const legacyProjectRootDir = pathApi.join(canonicalDirectory, stateDir)

  if (mode === "project") {
    return buildPaths({
      mode,
      rootDir: legacyProjectRootDir,
      project,
      legacyProjectRootDir,
      pathApi,
    })
  }

  const globalRootDir = resolveGlobalStateRoot({ globalStateRoot: options.globalStateRoot, env, platform, homeDir })
  return buildPaths({
    mode,
    rootDir: pathApi.join(globalRootDir, projectKey),
    project,
    globalRootDir,
    legacyProjectRootDir,
    pathApi,
  })
}

function buildPaths(input: {
  mode: StateMode
  rootDir: string
  project: ProjectStateMetadata
  globalRootDir?: string
  legacyProjectRootDir: string
  pathApi: typeof posix | typeof win32
}): ChorusPaths {
  const { mode, rootDir, project, globalRootDir, legacyProjectRootDir, pathApi } = input
  return {
    mode,
    rootDir,
    stagingDir: pathApi.join(rootDir, "staging"),
    stateFile: pathApi.join(rootDir, "opencode-state.json"),
    sharedFile: pathApi.join(rootDir, "shared.json"),
    legacyClaudeStateFile: pathApi.join(rootDir, "state.json"),
    sessionsDir: pathApi.join(rootDir, "sessions"),
    locksDir: pathApi.join(rootDir, "locks"),
    project,
    ...(globalRootDir ? { globalRootDir } : {}),
    legacyProjectRootDir,
    legacyProjectStateFile: pathApi.join(legacyProjectRootDir, "opencode-state.json"),
    legacyProjectSharedFile: pathApi.join(legacyProjectRootDir, "shared.json"),
    legacyProjectClaudeStateFile: pathApi.join(legacyProjectRootDir, "state.json"),
    legacyProjectSessionsDir: pathApi.join(legacyProjectRootDir, "sessions"),
  }
}

function resolveGlobalStateRoot(input: {
  globalStateRoot?: string
  env: Record<string, string | undefined>
  platform: StatePlatform
  homeDir: string
}): string {
  const pathApi = pathForPlatform(input.platform)
  const override = input.globalStateRoot?.trim()
  if (override) return normalizeRootPath(override, input.platform, input.homeDir)

  if (input.platform === "darwin") {
    return pathApi.join(normalizeRootPath(input.homeDir, input.platform, input.homeDir), "Library", "Application Support", "OpenCode", "Chorus")
  }

  if (input.platform === "win32") {
    const base = input.env.LOCALAPPDATA?.trim() || input.env.APPDATA?.trim() || pathApi.join(input.homeDir, "AppData", "Local")
    return pathApi.join(normalizeRootPath(base, input.platform, input.homeDir), "OpenCode", "Chorus")
  }

  const base = input.env.XDG_STATE_HOME?.trim() || pathApi.join(input.homeDir, ".local", "state")
  return pathApi.join(normalizeRootPath(base, input.platform, input.homeDir), "opencode", "chorus")
}

function normalizeProjectPath(path: string, platform: StatePlatform, homeDir: string): string {
  const normalized = stripTrailingSeparator(normalizeRootPath(path, platform, homeDir), platform)
  return platform === "win32" ? normalized.toLowerCase() : normalized
}

function normalizeRootPath(path: string, platform: StatePlatform, homeDir: string): string {
  const pathApi = pathForPlatform(platform)
  const expanded = expandHome(path, homeDir, pathApi)
  const resolved = pathApi.resolve(expanded)
  const normalized = pathApi.normalize(resolved)
  if (platform === "win32") return normalized.replaceAll("/", "\\")
  return normalized.normalize("NFC")
}

function stripTrailingSeparator(path: string, platform: StatePlatform): string {
  const pathApi = pathForPlatform(platform)
  const root = pathApi.parse(path).root
  let result = path
  while (result.length > root.length && (result.endsWith(pathApi.sep) || result.endsWith("/"))) {
    result = result.slice(0, -1)
  }
  return result
}

function pathForPlatform(platform: StatePlatform): typeof posix | typeof win32 {
  return platform === "win32" ? win32 : posix
}

function expandHome(path: string, homeDir: string, pathApi: typeof posix | typeof win32): string {
  if (path === "~") return homeDir
  if (path.startsWith("~/") || path.startsWith("~\\")) return pathApi.join(homeDir, path.slice(2))
  return path
}

function sanitizeProjectSegment(segment: string): string {
  const sanitized = segment.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+|\.+$/g, "")
  return sanitized || "project"
}

function hashProjectPath(platform: StatePlatform, canonicalDirectory: string): string {
  return createHash("sha256").update(`${platform}:${canonicalDirectory}`).digest("hex").slice(0, 12)
}
