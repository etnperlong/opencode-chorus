# opencode-chorus

OpenCode plugin for Chorus.

## Installation

Install dependencies with Bun when using this repository directly:

```bash
bun install
```

Enable the plugin through OpenCode's normal plugin mechanisms. For local development, create a local wrapper plugin:

```ts
// ~/.config/opencode/plugins/chorus.ts
import ChorusPlugin from "/absolute/path/to/opencode-chorus/index.ts"

export const ChorusLocalPlugin = ChorusPlugin
```

When published as an npm package, the intended OpenCode config is:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-chorus"]
}
```

## Configuration

Configure Chorus separately from OpenCode's `plugin` array. The plugin reads `chorus.json` from the OpenCode config directory and then applies environment variable overrides.

Default config file path:

```text
~/.config/opencode/chorus.json
```

If `OPENCODE_CONFIG_DIR` is set, the plugin reads:

```text
$OPENCODE_CONFIG_DIR/chorus.json
```

If `XDG_CONFIG_HOME` is set and `OPENCODE_CONFIG_DIR` is not, the plugin reads:

```text
$XDG_CONFIG_HOME/opencode/chorus.json
```

Example `chorus.json`:

```json
{
  "chorusUrl": "http://localhost:3000",
  "enableProposalReviewer": true,
  "enableTaskReviewer": true,
  "maxProposalReviewRounds": 3,
  "maxTaskReviewRounds": 3,
  "stateDir": ".chorus",
  "sharedStateMode": "compatible"
}
```

Set the API key through the environment when possible:

```bash
export CHORUS_API_KEY="your-chorus-api-key"
```

The plugin also supports `apiKey` in `chorus.json`, but it logs a warning recommending `CHORUS_API_KEY` because API keys are secrets.

Supported environment variables:

- `CHORUS_BASE_URL`: Chorus server base URL, for example `http://localhost:3000`
- `CHORUS_URL`: fallback alias for `CHORUS_BASE_URL`
- `CHORUS_API_KEY`: Chorus API key
- `CHORUS_PROJECT_UUIDS`: comma-separated project UUIDs
- `CHORUS_STATE_DIR`: local state directory, default `.chorus`
- `CHORUS_SHARED_STATE_MODE`: `compatible` or `isolated`
- `CHORUS_AUTO_START`: `true`, `false`, `1`, or `0`
- `CHORUS_ENABLE_PROPOSAL_REVIEWER`: `true`, `false`, `1`, or `0`
- `CHORUS_ENABLE_TASK_REVIEWER`: `true`, `false`, `1`, or `0`
- `CHORUS_MAX_PROPOSAL_REVIEW_ROUNDS`: positive integer
- `CHORUS_MAX_TASK_REVIEW_ROUNDS`: positive integer

Configuration precedence is:

```text
defaults < chorus.json < environment variables < explicit plugin options
```

## Features

- Chorus MCP tools in OpenCode
- `.chorus` compatibility with isolated OpenCode state
- proposal planning scope
- automated proposal and task reviewer comments with review-state persistence
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

This package includes OpenCode skill prompts for the Chorus workflow. When the plugin loads, it auto-registers the bundled `skills/` directory with OpenCode's native skill discovery, so no manual symlinks or manual `skills.paths` entries are required for these bundled skills.

- `skills/chorus/SKILL.md`: platform overview and lifecycle rules
- `skills/idea/SKILL.md`: early idea capture and refinement
- `skills/proposal/SKILL.md`: proposal, task, acceptance criteria, and dependency planning
- `skills/develop/SKILL.md`: approved task implementation
- `skills/quick-dev/SKILL.md`: small approved changes
- `skills/review/SKILL.md`: automated reviewer comment and review-state flow

Use the stage-specific skill that matches the current Chorus workflow stage.

If the Chorus skills do not appear in `/skills`:

1. Confirm the plugin is enabled and loaded by OpenCode.
2. Restart OpenCode after enabling or updating the plugin.
3. Confirm the bundled `SKILL.md` files still contain valid `name` and `description` frontmatter.
