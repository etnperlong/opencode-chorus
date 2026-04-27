# opencode-chorus

OpenCode plugin for Chorus.

## Installation

Install dependencies with Bun:

```bash
bun install
```

Register the plugin from this package in your OpenCode configuration, then provide Chorus connection settings through the plugin config.

## Configuration

The plugin accepts these configuration keys:

- `chorusUrl`: Chorus server URL
- `apiKey`: Chorus API key
- `projectUuids`: optional parsed project UUID list reserved for routing or future project scoping
- `stateDir`: optional override for the local `.chorus` state directory
- reviewer toggles: optional settings for enabling or disabling automated proposal and task reviewer-shell comments

## Features

- Chorus MCP tools in OpenCode
- `.chorus` compatibility with isolated OpenCode state
- proposal planning scope
- automated proposal and task reviewer-shell comments with review-state persistence
- Chorus notification routing

## State Layout

The plugin writes:

- `.chorus/opencode-state.json`
- `.chorus/shared.json`
- `.chorus/sessions/*.json`

The plugin does not use `.chorus/state.json` as its primary writable state file.

Compatibility files under `.chorus/` allow Chorus sessions, shared project metadata, planning scope, and review routing to work across tools while keeping OpenCode-specific lifecycle state isolated.

## Manual Verification

These steps require a running Chorus development server and valid Chorus credentials. Local verification only covers tests and typechecking; live OpenCode plugin loading, Chorus connectivity, SSE routing, and reviewer comment posting must be run separately against a real Chorus server.

1. Load the plugin in OpenCode with valid `chorusUrl` and `apiKey`
2. Confirm `.chorus/opencode-state.json` is created
3. Confirm `.chorus/sessions/main.json` appears after session start
4. Run `chorus_checkin`, then run `chorus_get_task` with a valid `taskUuid` from the current project
5. Submit a proposal and verify a proposal review comment is posted
6. Submit a task for verification and verify a task review comment is posted
7. Seed or create a running worker record, restart the session, and confirm it is marked `aborted` with `finishedAt` in `.chorus/opencode-state.json`

## Skills

This package includes OpenCode skill prompts for the Chorus workflow:

- `skills/chorus/SKILL.md`: platform overview and lifecycle rules
- `skills/idea/SKILL.md`: early idea capture and refinement
- `skills/proposal/SKILL.md`: proposal, task, acceptance criteria, and dependency planning
- `skills/develop/SKILL.md`: approved task implementation
- `skills/quick-dev/SKILL.md`: small approved changes
- `skills/review/SKILL.md`: automated reviewer-shell comment and review-state flow

Use the stage-specific skill that matches the current Chorus workflow stage.
