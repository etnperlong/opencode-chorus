# opencode-chorus

OpenCode plugin for Chorus.

## Installation

### Local development

Install dependencies with Bun when using this repository directly:

```bash
bun install
```

Enable the plugin through OpenCode's normal plugin mechanisms. For local development, create a local wrapper plugin:

```ts
// ~/.config/opencode/plugins/chorus.ts
import ChorusPlugin from "/absolute/path/to/opencode-chorus/src/index.ts"

export const ChorusLocalPlugin = ChorusPlugin
```

### npm package

Install `opencode-chorus` from npm, then enable it in OpenCode:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-chorus"]
}
```

The published package includes the bundled Chorus `skills/` directory and reviewer `prompts/` files, so no extra wiring is required after installation.

## Configuration

Configure Chorus separately from OpenCode's `plugin` array. The plugin reads `chorus.json` from the OpenCode config directory and then applies environment variable overrides. When `chorusUrl` and `apiKey` are available, the plugin also auto-registers a native `chorus` remote MCP server in OpenCode. If either credential is missing, bundled skills and reviewer-agent config still load, but the native Chorus MCP server is not injected until OpenCode is restarted with valid credentials.

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
- `CHORUS_REVIEWER_WAIT_TIMEOUT_MS`: max milliseconds to wait for automatic reviewer verdicts, default `300000`
- `CHORUS_REVIEWER_POLL_INTERVAL_MS`: milliseconds between reviewer verdict polls, default `1000`

Configuration precedence is:

```text
defaults < chorus.json < environment variables < explicit plugin options
```

## Features

- native Chorus MCP auto-registration in OpenCode
- `.chorus` compatibility with isolated OpenCode state
- proposal planning scope
- automated proposal and task reviewer comments with review-state persistence
- strict proposal/task reviewer gating that waits for a verdict before the triggering workflow continues
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

1. Load the plugin in OpenCode with valid `chorusUrl` and `apiKey`, then restart OpenCode after any credential change
2. Confirm the native `chorus` MCP server appears in OpenCode's MCP list
3. Confirm `.chorus/opencode-state.json` is created
4. Confirm `.chorus/sessions/main.json` appears after session start
5. Use the native Chorus MCP tool surface to run `chorus_checkin`, then run `chorus_get_task` with a valid `taskUuid` from the current project
6. Complete a native proposal flow ending with `chorus_pm_submit_proposal` and verify a proposal review comment is posted
7. Complete a native task verification flow ending with `chorus_submit_for_verify` and verify a task review comment is posted
8. Seed or create a running worker record, restart the session, and confirm it is marked `aborted` with `finishedAt` in `.chorus/opencode-state.json`

## Skills

This package includes OpenCode skill prompts for the Chorus workflow. When the plugin loads, it auto-registers the bundled `skills/` directory with OpenCode's native skill discovery, so no manual symlinks or manual `skills.paths` entries are required for these bundled skills.

Bundled skills are adapted from Chorus's plugin-embedded skill set and use OpenCode-compatible `SKILL.md` YAML frontmatter for metadata. OpenCode does not require per-skill `package.json` files for Agent Skills, so this package keeps metadata in the fields OpenCode documents: `name`, `description`, `license`, `compatibility`, and `metadata`.

The stage-specific skills use a `chorus-` prefix so users can manage them with OpenCode skill permission patterns such as `chorus-*` without affecting unrelated workflow skills.

- `skills/chorus/SKILL.md`: platform overview, shared tools, setup, lifecycle rules, and skill routing
- `skills/chorus-idea/SKILL.md`: idea claiming, elaboration, requirements clarification, and owner confirmation
- `skills/chorus-proposal/SKILL.md`: proposal planning, PRD and tech design drafts, task drafts, acceptance criteria, and dependency DAGs
- `skills/chorus-develop/SKILL.md`: approved task implementation, work reporting, self-checks, subagent attribution, and verification submission
- `skills/chorus-quick-dev/SKILL.md`: small approved changes, quick tasks, hotfixes, and optional admin self-verification
- `skills/chorus-review/SKILL.md`: proposal approval/rejection, task verification, reviewer verdict handling, and governance
- `skills/chorus-yolo/SKILL.md`: full-auto AI-DLC pipeline from prompt to completion with reviewer loops and wave-based execution

Use the stage-specific skill that matches the current Chorus workflow stage.

If the Chorus skills do not appear in `/skills`:

1. Confirm the plugin is enabled and loaded by OpenCode.
2. Restart OpenCode after enabling or updating the plugin.
3. Confirm the bundled `SKILL.md` files still contain valid `name` and `description` frontmatter.
