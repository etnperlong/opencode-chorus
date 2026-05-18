# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added

- Added `chorus-openspec` bundled skill for OpenSpec-aware proposal authoring, document draft mirroring, document update guidance, and archive reminders.
- Added TypeScript OpenSpec environment detection helpers for `openspec/` directory and `openspec` CLI availability checks.
- Added `chorus_pm_add_document_draft`, `chorus_pm_update_document_draft`, `chorus_pm_create_document`, and `chorus_pm_update_document` as **path-managed document tools** in the lazy Chorus bridge. Agents pass a `contentPath` file path; the bridge reads the file and injects its content as the real remote `content` field before forwarding the call.
- Added a per-project **Chorus document staging directory** (`<globalStateRoot>/<projectKey>/staging/`) that is created when a session starts and deleted when it ends. Staging files live outside the workspace, keeping the project clean and avoiding a second source of truth alongside Chorus.
- Injected the staging directory absolute path into the agent's Chorus context summary so agents always know where to write document bodies for non-OpenSpec workflows.
- Added `stagingDir` field to `ChorusPaths`, `ensureStagingDir()` and `cleanupStagingDir()` methods to `StateStore`, and a `stagingDir` option to `CreateChorusLazyBridgeToolsOptions`.

### Changed

- Updated bundled Chorus skills to upstream skill metadata version `0.8.3` and documented the Chorus v0.8 permission matrix and role presets.
- Expanded proposal and task reviewer prompts with stronger review procedures, anti-rubber-stamp guidance, hallucination checks, adversarial probes, and structured output templates.
- Increased reviewer sub-agent step budgets to 40 for proposal reviews and 50 for task reviews.
- Updated proposal, develop, and yolo workflow skills with OpenSpec-aware branching and document sync guidance.
- `chorus_tool_get` now returns a bridge-local schema overlay for the four managed document tools: `contentPath` replaces `content`, with `contentPath` required for `chorus_pm_add_document_draft` and optional for the other three.
- `chorus_tool_execute` rejects inline `content` for managed document tools with an explicit error, and validates that `contentPath` resolves to a readable file inside the workspace or the Chorus staging directory.
- Updated bundled skills (`chorus-proposal`, `chorus-yolo`, `chorus-review`, `chorus-develop`, `chorus-openspec`) to use `contentPath`-based document upload flows: non-OpenSpec skills write to the Chorus staging directory; `chorus-openspec` retains local OpenSpec artifact paths.
- Updated `chorus/SKILL.md` execution rules and `README.md` to document the global path-only document upload contract, the staging directory lifecycle, and the two-mode usage (staging for free-form, artifact paths for OpenSpec).

### Fixed

- Adapted `chorus_checkin` parsing for Chorus v0.8 response shapes, including grouped permission matrices, nested `agent.owner`, and `ideaTracker` project summaries.
- Removed the obsolete session file write/delete path that depended on removed `checkin.session.uuid` data.

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
