# opencode-chorus

The [Chorus](https://github.com/Chorus-AIDLC/Chorus) integration plugin for OpenCode. 

This plugin connects OpenCode to your Chorus instance, letting you manage proposals, execute tasks, and run the AI-DLC pipeline.

Current plugin release: `v0.3.1`. This release is compatible with the Chorus `v0.7.0` permission model.

## Changelog

Release notes are tracked in [CHANGELOG.md](./CHANGELOG.md).

## Features

When enabled, `opencode-chorus` loads Chorus workflow skills and exposes a lazy Chorus tool bridge inside OpenCode. You don't need to configure tools or link skill directories manually.

The plugin provides lifecycle hooks, 7 workflow skills, and 2 review agents for the AI-DLC process.

### Components

| Feature Category | Components | Description |
|---|---|---|
| **Lifecycle Hooks** | State Management | Keeps reviewer state and notification delivery data in OpenCode's per-user state directory. |
| | Lazy MCP Bridge | Exposes `chorus_tools`, `chorus_tool_get`, and `chorus_tool_execute`, then discovers real Chorus tools from the Chorus MCP server on demand. |
| **Review Agents** | Proposal Reviewer | Automated review agent that evaluates proposals and waits for verdicts. |
| | Task Reviewer | Automated review agent that verifies completed tasks. |
| **Workflow Skills** | `chorus` | The entry point. Platform overview, shared tools, and lifecycle rules. |
| | `chorus-idea` | Claim ideas, elaborate on requirements, and confirm with owners. |
| | `chorus-proposal` | Draft PRDs, tech designs, and task dependency graphs. |
| | `chorus-develop` | Implement tasks, report work, and run self-checks before verification. |
| | `chorus-quick-dev` | Handle small changes and hotfixes with optional self-verification. |
| | `chorus-review` | Handle reviewer verdicts, governance, and verification states. |
| | `chorus-yolo` | Execute the full-auto AI-DLC pipeline from prompt to completion. |

> **Note**: A local or online Chorus instance must be running and accessible to use this plugin.

## Getting Started

### 1. Install the Plugin

Install `opencode-chorus` from npm by adding it to your OpenCode configuration.

Edit your OpenCode config file (usually `~/.config/opencode/config.json`) to include the plugin:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-chorus"]
}
```

### 2. Configure Credentials

The plugin needs to know where your Chorus server is and how to authenticate. The easiest way to configure this is using environment variables.

The Chorus API key should include the permissions required by the workflows you plan to run. For example, read-only overview and search flows need `task:read`, task execution needs `task:write`, proposal work needs `proposal:write`, idea elaboration needs `idea:write`, and verification or governance flows need `task:admin`.

Set these in your terminal before running OpenCode:

```bash
export CHORUS_BASE_URL="http://localhost:3000" # Replace with your Chorus server URL
export CHORUS_API_KEY="your-chorus-api-key"
```

Optional observability settings:

```bash
export CHORUS_ENABLE_SESSION_CONTEXT_SUMMARY="true"
export CHORUS_ENABLE_NOTIFICATION_HINTS="true"
export CHORUS_REVIEW_GATE_OUTPUT_MODE="summary" # summary or detailed
```

Optional state storage settings:

```bash
export CHORUS_STATE_MODE="global" # global or project
export CHORUS_GLOBAL_STATE_ROOT="/custom/opencode/chorus/state"
```

Alternatively, you can create a `chorus.json` file in your OpenCode configuration directory (`~/.config/opencode/chorus.json`):

```json
{
  "chorusUrl": "http://localhost:3000",
  "enableProposalReviewer": true,
  "enableTaskReviewer": true,
  "enableSessionContextSummary": true,
  "enableNotificationHints": true,
  "reviewGateOutputMode": "summary",
  "stateMode": "global",
  "globalStateRoot": "/custom/opencode/chorus/state"
}
```
*Note: While you can put your API key in `chorus.json`, using the `CHORUS_API_KEY` environment variable is strongly recommended for security.*

Observability behavior:

- `enableSessionContextSummary` controls one concise startup/resume Chorus context summary. When disabled, context remains runtime-only and no proactive summary is shown.
- `enableNotificationHints` controls actionable text on routed notification queue entries. When disabled, supported notifications are still queued without hint text.
- `reviewGateOutputMode` controls reviewer gate output verbosity. `summary` keeps output concise; `detailed` includes expanded reviewer job, round, target, comment, timeout, escalation, and verdict details.

These settings only control visibility and hints. They do not auto-claim tasks, approve proposals, or verify tasks.

State storage behavior:

- `stateMode` defaults to `global`, which stores OpenCode-owned Chorus state outside the project workspace.
- Linux uses `${XDG_STATE_HOME}/opencode/chorus` when `XDG_STATE_HOME` is set, otherwise `~/.local/state/opencode/chorus`.
- macOS uses `~/Library/Application Support/OpenCode/Chorus`.
- Windows uses `%LOCALAPPDATA%\OpenCode\Chorus`, with `%APPDATA%` or a home-directory fallback only if `LOCALAPPDATA` is unavailable.
- Each project gets a stable `<basename>-<hash>` directory derived from OpenCode's canonical `ctx.directory`; `ctx.worktree` is stored as diagnostic metadata when available.
- The persisted file keeps only reviewer state, notification queue data, and project metadata. Session context, lazy bridge status, notification connection status, planning scopes, workers, and checkpoints are runtime-only.
- On first startup, an existing `.chorus/opencode-state.json` is migrated into the global store if the target global state file does not already exist. Only still-supported persisted fields are imported.
- After successful migration, known plugin-owned legacy files such as `.chorus/opencode-state.json`, `.chorus/shared.json`, and `.chorus/sessions/main.json` are cleaned up. Unknown files are preserved.
- To temporarily roll back to project-local storage, set `CHORUS_STATE_MODE=project` or `"stateMode": "project"`. In project mode, `stateDir` is honored and defaults to `.chorus`.
- `stateDir` is deprecated for default global storage and is ignored unless project-local mode is explicitly selected.

### Lazy Chorus Tools

The plugin no longer injects a remote `mcp.chorus` server into OpenCode by default. Instead, it exposes three native bridge tools:

- `chorus_tools` lists all Chorus tool names exposed by the remote Chorus MCP server.
- `chorus_tool_get` returns the description for one Chorus tool.
- `chorus_tool_execute` executes a real Chorus tool by name after applying the plugin's argument-safety policy.

For example, to update a task status, first call `chorus_tools`, then inspect `chorus_update_task` with `chorus_tool_get`, then execute it through the bridge. The bridge keeps the real Chorus tool list in session memory and refreshes it when sessions start or resume.

#### Document Body Uploads Are Path-Only

The four managed document write tools — `chorus_pm_add_document_draft`, `chorus_pm_update_document_draft`, `chorus_pm_create_document`, and `chorus_pm_update_document` — require a `contentPath` parameter instead of inline `content`.

**For non-OpenSpec workflows**, write the document body to a file in the Chorus staging directory and pass its absolute path via `contentPath`. The plugin injects the staging directory path at session start (in the Chorus context summary). The bridge reads the file and injects its content into the remote Chorus call. Staging files are outside the workspace and are deleted automatically when the session ends.

**For OpenSpec workflows** (`chorus-openspec`), pass the local OpenSpec artifact path (e.g., `openspec/changes/<slug>/proposal.md`) directly.

Passing inline `content` to any of these tools returns a local error and stops the call before it reaches the Chorus server. Paths outside the workspace root and the Chorus staging directory are also rejected.

### 3. Restart OpenCode

After installing the plugin and setting your credentials, restart OpenCode.

You will see the Chorus skills in your workspace. Start by asking OpenCode to use the `chorus` skill to inspect available permissions and route into the right workflow, or run a specific stage like `chorus-idea` or `chorus-yolo`.
