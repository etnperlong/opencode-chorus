# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Fixed

- Fixed connection toast showing "multiple projects" when no workspace project is bound; toast now only displays a project name when exactly one project is available or bound.

### Changed

- Updated bundled Chorus skills to upstream skill metadata version `0.10.0`, including Idea lineage guidance for `parentUuid`, `chorus_edit_idea`, and full-subtree `chorus_move_idea` behavior.
- Updated reviewer prompts and proposal review snapshots to request explicit `chorus_get_proposal` sections when full draft bodies or proposal documents are required.
- Updated MCP clientInfo version reporting to use the package version instead of the stale hard-coded `0.1.0` value.
- Bumped the plugin package version to `0.10.0` to match the upstream Chorus plugin version.

## v0.6.0 - 2026-06-09

### Added

- Added runtime `activeAgent` tracking from `chat.params` so system prompt injection can adapt to the current OpenCode agent.
- Added configurable prompt injection toggles: `enableSubsessionInjection`, `enablePlanAgentGuidance`, and `enablePerTurnReminder`, all enabled by default.
- Added concise per-turn Chorus reminders, sub-session task workflow guidance, and Plan agent AI-DLC guidance.

### Changed

- Refactored system prompt injection to remove repeated native file tools and skill-first guidance while retaining dynamic `Chorus Context` refreshes.
- Limited Chorus staging directory guidance to the first injection per hook lifecycle to reduce repeated token overhead.
- Moved key Chorus skill usage guidance into `AGENTS.md` so agents still load the narrowest Chorus skill and use the lazy bridge discovery flow without repeated system prompt injection.
- Updated system prompt injection docs in `docs/CONFIGURATION.md` and `docs/COMPONENTS.md`.
- Updated bundled Chorus skills to upstream skill metadata version `0.9.4`, including the v0.9.4 elaboration contract, structured acceptance criteria examples, and explicit `chorus_get_proposal` section usage.
- Bumped package version to `0.6.0`.

### Fixed

- Fixed session-start TUI Toast not showing after the dedicated Chorus agent removal by adding `showConnectionToast()` to session hydration.
- Fixed the OpenSpec change artifact for prompt injection alignment by converting it into a valid `plugin-runtime` capability delta.

## v0.5.0 - 2026-05-26

### Added

- Added the `chorus-brainstorm` bundled skill as an OpenCode-adapted prelude for fuzzy idea exploration before structured Chorus elaboration.
- Added post-`chorus_admin_verify_task` idea-completion report reminders that prompt `chorus_create_report` only when an idea-rooted proposal is fully done and still has no report document.

### Changed

- Updated bundled Chorus skills to upstream skill metadata version `0.9.0` and aligned the local OpenCode guidance with Chorus `v0.9.0` workflows.
- Expanded core, idea, develop, and yolo skill guidance to cover brainstorm routing, `chorus_create_report`, `report` documents, and the simplified `active | closed` session lifecycle semantics.
- Replaced stale proposal skill examples that referenced removed MCP tools with `chorus_create_tasks` and `chorus_update_task({ addDependsOn/removeDependsOn })`.
- Raised proposal and task reviewer agent step budgets to `100` to match the upstream Claude Code plugin review envelope.

### Fixed

- Removed stale bundled-skill references to deleted Chorus MCP tools `chorus_pm_create_tasks`, `chorus_add_task_dependency`, and `chorus_remove_task_dependency`.
- Removed outdated session guidance that still described `inactive` sessions or `expiresAt`-style lifecycle behavior after the upstream `v0.9.0` session model simplification.

## v0.4.0 - 2026-05-21

### Added

- Added Chorus SSE notification coordination with project scoping, queue continuity, checkpointed backfill, main-session handoff, duplicate-delivery prevention, reconnect shutdown handling, and runtime scope diagnostics.
- Added `projectUuids` / `CHORUS_PROJECT_UUIDS` notification allowlists so multi-project workspaces can suppress out-of-scope notification delivery.
- Added `chorus-openspec` bundled skill and OpenSpec environment detection helpers for `openspec/` directory and `openspec` CLI availability checks.
- Added path-managed document uploads for `chorus_pm_add_document_draft`, `chorus_pm_update_document_draft`, `chorus_pm_create_document`, and `chorus_pm_update_document`: agents pass `contentPath`, and the lazy bridge reads the file before forwarding the remote Chorus call.
- Added per-project Chorus document staging directories under global state, including staging lifecycle cleanup, `ChorusPaths.stagingDir`, `StateStore.ensureStagingDir()`, `StateStore.cleanupStagingDir()`, `CreateChorusLazyBridgeToolsOptions.stagingDir`, and staging-path context guidance.
- Added a `permission.ask` hook that auto-allows OpenCode `write` and `edit` permission requests targeting the Chorus staging directory.
- Added bounded native-agent `Chorus Context` injection from cached runtime state, including managed, unmanaged, and ambiguous project-scope guidance plus owner, permission, and OpenSpec summaries.
- Added reviewer TUI toast notifications that show target names, review rounds, completion verdicts, and aggregate concurrent reviewers without exposing reviewer session IDs.
- Added `chorus_workspace_context`, a local-only tool for explicitly binding or unbinding the current workspace to a Chorus project UUID with TUI toast confirmation.

### Changed

- Moved fresh OpenCode/Chorus state to global storage by default, kept `stateMode: "project"` for project-local state, and retained legacy `.chorus` migration support.
- Updated bundled Chorus skills to upstream skill metadata version `0.8.3` and documented the Chorus v0.8 permission matrix, role presets, OpenSpec-aware branching, and document sync guidance.
- Expanded proposal and task reviewer agents with stronger review procedures, anti-rubber-stamp guidance, hallucination checks, adversarial probes, structured output templates, and higher step budgets.
- Deferred Chorus readiness until runtime startup/resume can hydrate cached context for native agents.
- Changed notification intake and main-session handoff so listener restarts, startup catch-up, queued assistant-turn notifications, and ownership gaps are handled consistently.
- Removed the dedicated bundled `chorus` agent and prompt resource; native OpenCode agents now load Chorus skills directly and use `chorus_tools`, `chorus_tool_get`, and `chorus_tool_execute` without an agent allow-list.
- Moved fresh session-context hydration onto native `chat.params` startup/resume flow so cached Chorus context remains available after the dedicated agent removal.
- Updated the system transform to prefer skill-first native workflows, explain direct native-agent bridge access, and describe managed versus unmanaged Chorus project context behavior.

### Fixed

- Fixed `chorus_tool_execute` argument handling by removing the unused `argumentPolicy` path and normalizing arguments consistently before remote execution.
- Fixed Chorus state initialization so state files are created lazily instead of requiring eager session-file setup.
- Fixed task reviewer verification gates by allowing read-only bash checks without child-session permission deadlocks.
- Adapted session context parsing for Chorus v0.8 response shapes, including grouped permission matrices, nested `agent.owner`, and `ideaTracker` project summaries.
- Fixed multi-session and multi-project notification routing so out-of-scope, unresolved-scope, and missing-`projectUuid` notifications do not trigger queue delivery, toasts, or assistant turns.
- Fixed native bridge compatibility after the dedicated-agent removal by keeping reviewer silent-readiness behavior limited to `proposal-reviewer` and `task-reviewer` while allowing normal native agents to call the lazy bridge tools directly.
- Fixed global-mode shared workspace context persistence so project bindings are written under the `projectKey` state directory and reused by later sessions.
- Fixed plugin hook test isolation and TypeScript configuration so module mocks do not pollute cross-file `ChorusMcpClient` behavior.

### Documentation

- Rewrote `README.md` with the v0.4.0 workflow, native-agent bridge usage, notification scoping rules, single-owner queue consumption, and managed versus unmanaged Chorus project context.
- Added `docs/CONFIGURATION.md`, `docs/COMPONENTS.md`, `CONTRIBUTING.md`, and `AGENTS.md`.
- Moved the changelog to `docs/CHANGELOG.md`.

## v0.3.2 - 2026-05-05

### Changed

- Replaced the lazy bridge discovery flow with `chorus_tools` and `chorus_tool_get`, removing the unstable natural-language `chorus_tool_explore` path.
- Updated the lazy bridge to expose and require raw Chorus MCP tool names such as `chorus_get_task` instead of trimmed public aliases.
- Refreshed the README and bundled Chorus skills to teach the new `chorus_tools` → `chorus_tool_get` → `chorus_tool_execute` workflow.

### Fixed

- Fixed reviewer gate timeout handling so active reviewer child sessions are checked through OpenCode `session.status` before being treated as timed out.
- Fixed live reviewer gate result propagation for long-running task reviews by extending the wait window once and surfacing a `running` state when the reviewer is still busy.
- Added stronger regression coverage for delayed reviewer completion and reviewer-session status lookup failures.

## v0.3.1 - 2026-05-02

### Changed

- Updated the plugin's stored Chorus session context to prefer `agent.permissions` while still accepting legacy `roles` payloads.
- Migrated bundled skill metadata and workflow guidance from role labels to single-permission access labels such as `task:read`, `task:write`, `idea:write`, `proposal:write`, and `task:admin`.
- Kept the plugin release version separate from the upstream Chorus compatibility version; this release targets plugin version `v0.3.1` with Chorus `v0.7.0` compatibility.

### Fixed

- Fixed the OpenCode documentation so API-key setup guidance matches the Chorus v0.7.0 permission model.

## v0.3.0 - 2026-05-01

### Added

- Added a lazy Chorus MCP bridge to dynamically discover and execute real Chorus tools.

### Fixed

- Exposed short Chorus tool aliases in the lazy bridge for improved usability.

## v0.2.0 - 2026-04-30

### Added

- Added observability configuration options for session context summaries, notification hints, and reviewer gate output verbosity.
- Added compact Chorus session context persistence in `.chorus/opencode-state.json` to improve startup and recovery behavior.
- Added actionable notification hints for routed task assignment notifications.
- Added targeted regression tests for reviewer output propagation, review round reuse, and hook behavior.

### Changed

- Improved reviewer gate output so tool results can expose richer reviewer state, including running, timeout, escalation, and interrupted cases.
- Improved startup and resume session handling so Chorus context is surfaced more predictably and with less noise.
- Improved review round handling by tracking target signatures for proposal and task reviews.

### Fixed

- Fixed reviewer visibility regressions reported in Issue #1, including missing full reviewer comment content in main-agent-visible tool results.
- Fixed duplicate or unnecessary reviewer rounds when a target is unchanged, already under review, or temporarily unavailable for snapshot loading.
- Fixed startup fallback behavior for updated sessions.
- Fixed reviewer comment persistence so verdict comments written through the fast `chorus_add_comment` path are retained in review state.

## v0.1.0 - 2026-04-28

### Added

- Initial release of `opencode-chorus` for connecting OpenCode to Chorus.
- Added automatic Chorus MCP registration and `.chorus` local state integration.
- Added Chorus workflow skills for ideation, proposal planning, development, review, quick development, and full-pipeline execution.
- Added automated proposal and task reviewer agents for gated review workflows.

### Changed

- Established the first packaged OpenCode plugin workflow for running Chorus AI-DLC flows from within OpenCode.

### Fixed

- Included the first round of workflow and packaging fixes required to publish and use the plugin through npm.
