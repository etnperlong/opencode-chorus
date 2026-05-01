# Changelog

All notable changes to this project will be documented in this file.

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
