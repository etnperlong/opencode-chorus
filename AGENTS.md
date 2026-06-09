# Repository Guidelines

## Commands

- Use Bun as the package manager; CI installs with `bun install --frozen-lockfile`.
- CI verification order is `bun run typecheck`, `bun run test`, then `bun run build`.
- Run one test file with `bun test test/unit/config-loader.test.ts` or `bun test src/hooks/tool-execute-after-hook.test.ts`.
- `bun run build` emits `dist/` from `src/` using `tsconfig.build.json`; `bun run clean` only removes `dist/`.
- `bun run pack:check` runs `npm pack --dry-run`; `prepublishOnly` runs typecheck, tests, and pack check.
- There is no lint or formatter script/config in this repo; do not invent a lint step.

## Architecture

- `src/index.ts` is the plugin entrypoint and exports `createPlugin`, `ChorusPlugin`, and the default plugin.
- Startup wiring in `src/index.ts` loads config, initializes `StateStore`, creates `ChorusMcpClient`, registers bundled skills/reviewer agents, hooks OpenCode events, hooks tool execution, and exposes the lazy bridge tools.
- Bundled runtime assets are part of the npm contract: `skills/`, `prompts/`, `README.md`, `LICENSE`, and built `dist/` are listed in `package.json` `files` and asserted by tests.
- Reviewer agent definitions live in `src/reviewers/reviewer-agents.ts`; their prompts are loaded from `prompts/proposal-reviewer.md` and `prompts/task-reviewer.md`.
- The lazy Chorus bridge exposes only `chorus_tools`, `chorus_tool_get`, and `chorus_tool_execute`; bridge execution requires raw Chorus MCP tool names like `chorus_get_task`.

## Configuration And State

- Config precedence is `chorus.json` in the OpenCode config dir, then environment variables, then explicit plugin options.
- OpenCode config dir resolution is `OPENCODE_CONFIG_DIR`, then `XDG_CONFIG_HOME/opencode`, then `~/.config/opencode`.
- Required runtime config is `chorusUrl` plus `apiKey`; env supports `CHORUS_BASE_URL` or `CHORUS_URL`, and `CHORUS_API_KEY` is preferred over storing secrets in `chorus.json`.
- Chorus prompt injection toggles default to enabled: `enableSubsessionInjection`, `enablePlanAgentGuidance`, and `enablePerTurnReminder`.
- Default state mode is global. In global mode, `stateDir` is ignored except for legacy `.chorus` migration; set `stateMode: "project"` to force project-local state.
- Persisted state intentionally keeps only reviews, notification queue, and project metadata. Session context, lazy bridge status, notification runtime, workers, and checkpoints are runtime-only.

## Chorus Workflow

- When using Chorus in this workspace, load the narrowest Chorus skill for the current stage instead of relying on long system prompt manuals.
- Discover remote tools with `chorus_tools`, inspect with `chorus_tool_get`, then execute raw Chorus MCP tool names through `chorus_tool_execute`, for example `chorus_get_task`.
- Use `chorus_workspace_context` only when the user explicitly asks to bind or unbind workspace context.
- For OpenSpec-backed proposals, keep local `openspec/changes/<slug>/` artifacts as the source of truth before mirroring changes to Chorus.

## Tests And Contracts

- Tests use Bun's test runner and temp dirs/mocks; a live Chorus server is not required for the current suite.
- Changing bundled skill names, frontmatter, metadata, or sentinel content usually requires updating `test/unit/skill-metadata.test.ts`.
- Changing package exports, package files, scripts, engines, or build output assumptions usually requires updating `test/unit/package-manifest.test.ts`.
- Reviewer verdict parsing only accepts exact lines: `VERDICT: PASS`, `VERDICT: PASS WITH NOTES`, or `VERDICT: FAIL`.
- Reviewer comments must include `Review-Job-ID: <sessionId>`; hooks use it to associate verdict comments with reviewer sessions.

## TypeScript Notes

- The package is ESM (`"type": "module"`) and compiles with TypeScript `moduleResolution: "bundler"`.
- Keep local source imports extensionless. `tsconfig.json` allows `.ts` imports for no-emit typechecking, but `tsconfig.build.json` disables them for emitted builds.
- `tsconfig.json` typechecks both `src/**/*.ts` and `test/**/*.ts`; `tsconfig.build.json` builds only `src/**/*.ts` with declarations.

## Local Workflow Files

- `.opencode/` and `openspec/` may exist in this workspace, but `.gitignore` ignores them and `git ls-files` shows no tracked files there; do not treat them as package source unless the user explicitly asks.
