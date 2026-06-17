# Configuration

This document covers all configuration options for `opencode-chorus`.

## Configuration Precedence

Config values are resolved in this order (highest priority first):

1. Environment variables
2. `chorus.json` in the OpenCode config directory
3. Explicit plugin options passed at runtime

The OpenCode config directory is resolved as:

- `OPENCODE_CONFIG_DIR` (if set)
- `$XDG_CONFIG_HOME/opencode`
- `~/.config/opencode`

## Required Settings

| Setting | `chorus.json` field | Environment Variable | Description |
|---|---|---|---|
| Chorus URL | `chorusUrl` | `CHORUS_BASE_URL` or `CHORUS_URL` | Base URL of your Chorus server |
| API Key | `apiKey` | `CHORUS_API_KEY` | Chorus API key (prefer env var for security) |

> [!WARNING]
> While you can put your API key in `chorus.json`, using the `CHORUS_API_KEY` environment variable is strongly recommended for security.

### API Key Permissions

The Chorus API key should include the permissions required by the workflows you plan to run:

| Workflow | Required Permission |
|---|---|
| Read-only overview and search | `task:read` |
| Task execution | `task:write` |
| Proposal work | `proposal:write` |
| Idea elaboration | `idea:write` |
| Verification and governance | `task:admin` |

## Minimal `chorus.json`

```json
{
  "chorusUrl": "http://localhost:3000",
  "apiKey": "your-chorus-api-key"
}
```

## Full `chorus.json` Reference

```json
{
  "chorusUrl": "http://localhost:3000",
  "apiKey": "your-chorus-api-key",
  "projectUuids": ["project-uuid-1", "project-uuid-2"],
  "enableProposalReviewer": true,
  "enableTaskReviewer": true,
  "enableSessionContextSummary": true,
  "enableNotificationHints": true,
  "reviewGateOutputMode": "summary",
  "stateMode": "global",
  "globalStateRoot": "/custom/opencode/chorus/state"
}
```

## Environment Variables

### Required

```bash
export CHORUS_BASE_URL="http://localhost:3000"
export CHORUS_API_KEY="your-chorus-api-key"
```

### Optional — Observability

```bash
export CHORUS_ENABLE_SESSION_CONTEXT_SUMMARY="true"
export CHORUS_ENABLE_NOTIFICATION_HINTS="true"
export CHORUS_REVIEW_GATE_OUTPUT_MODE="summary"  # summary or detailed
export CHORUS_PROJECT_UUIDS="project-uuid-1,project-uuid-2"
```

### Optional — State Storage

```bash
export CHORUS_STATE_MODE="global"  # global or project
export CHORUS_GLOBAL_STATE_ROOT="/custom/opencode/chorus/state"
```

> [!NOTE]
> `autoStart` and `CHORUS_AUTO_START` are no longer supported. A legacy `autoStart` field in `chorus.json` is ignored without error; Chorus activation is always on demand.

## Configuration Options

### `projectUuids`

Defines the explicit Chorus project allowlist for automatic notification delivery.

- If one Chorus agent is used for more than one Chorus project, setting `projectUuids` is strongly recommended so the plugin does not rely on broad session context to decide which notifications belong to the current OpenCode workflow.
- If you need automatic notification delivery to be restricted to one project or a known subset of projects, `projectUuids` is required.
- If omitted, the plugin falls back to shared runtime project context and then to a single-project `sessionContext` inference. When it cannot prove a unique project scope, it safely suppresses active delivery instead of guessing.

### `enableSessionContextSummary`

Controls one concise Chorus context summary after on-demand activation. When disabled, context remains runtime-only and no proactive summary is shown.

### `enableNotificationHints`

Controls actionable text on routed notification queue entries. When disabled, supported notifications are still queued without hint text.

### `reviewGateOutputMode`

Controls reviewer gate output verbosity.

- `summary` — concise output
- `detailed` — includes expanded reviewer job, round, target, comment, timeout, escalation, and verdict details

### `stateMode`

Controls where the plugin stores its persistent state. Default: `global`.

- `global` — stores state outside the project workspace in a platform-specific location
- `project` — stores state in the project workspace (`.chorus` directory)

#### Global State Storage Paths

| Platform | Path |
|---|---|
| Linux | `${XDG_STATE_HOME}/opencode/chorus` (or `~/.local/state/opencode/chorus`) |
| macOS | `~/Library/Application Support/OpenCode/Chorus` |
| Windows | `%LOCALAPPDATA%\OpenCode\Chorus` |

Each project gets a stable `<basename>-<hash>` directory derived from OpenCode's canonical `ctx.directory`. The persisted file keeps only reviewer state, notification queue data, and project metadata. Session context, lazy bridge status, notification connection status, planning scopes, workers, and checkpoints are runtime-only.

### `globalStateRoot`

Override the default global state root directory. Only effective when `stateMode` is `global`.

### Legacy Migration

On first startup, an existing `.chorus/opencode-state.json` is migrated into the global store if the target global state file does not already exist. After successful migration, known plugin-owned legacy files (`.chorus/opencode-state.json`, `.chorus/shared.json`, `.chorus/sessions/main.json`) are cleaned up.

To temporarily roll back to project-local storage, set `CHORUS_STATE_MODE=project` or `"stateMode": "project"`. In project mode, `stateDir` is honored and defaults to `.chorus`.

> [!NOTE]
> `stateDir` is deprecated for default global storage and is ignored unless project-local mode is explicitly selected.

## Lazy Chorus Tools

The plugin registers the lazy bridge tools during startup but does not connect to Chorus until one of them is used. First use triggers readiness: the Chorus session is hydrated, the remote tool list is refreshed, the notification listener starts, and system prompt context injection becomes active.

The plugin exposes these native bridge tools:

| Tool | Description |
|---|---|
| `chorus_tools` | Lists all Chorus tool names exposed by the remote Chorus MCP server |
| `chorus_tool_get` | Returns the description for one Chorus tool |
| `chorus_tool_execute` | Executes a real Chorus tool by name after applying the plugin's argument-safety policy |
| `chorus_workspace_context` | Local-only workspace binding tool; also triggers on-demand Chorus activation before execution |

Usage flow: call `chorus_tools` → inspect a tool with `chorus_tool_get` → execute via `chorus_tool_execute`. The bridge keeps the real Chorus tool list in session memory after activation.

## Managed Project Context

After Chorus activation, each system transform injects a bounded `Chorus Context` summary into the native agent's system prompt using cached runtime state. Before activation, the transform hook leaves the system prompt unchanged.

| Scope | Behavior |
|---|---|
| `managed` | Plugin can confidently identify the active Chorus project; includes project name and UUID |
| `unmanaged` | No single Chorus project can be proven; warns the agent not to assume a `projectUuid` |
| `ambiguous` | Multiple Chorus projects may apply; reports candidate count without guessing |

When available, the injected context also includes owner metadata, permission scope, and OpenSpec availability. The Chorus staging directory guidance is injected only once per hook lifecycle.

Additional prompt guidance is controlled by these options, all enabled by default:

| Option | Behavior |
|---|---|
| `enablePerTurnReminder` | Adds a concise main-session Chorus reminder on each system transform |
| `enableSubsessionInjection` | Adds Chorus task workflow guidance for sub-sessions detected from the runtime main session ID |
| `enablePlanAgentGuidance` | Adds AI-DLC planning guidance when the active OpenCode agent is `plan` |

## Document Body Uploads

The four managed document write tools — `chorus_pm_add_document_draft`, `chorus_pm_update_document_draft`, `chorus_pm_create_document`, and `chorus_pm_update_document` — require a `contentPath` parameter instead of inline `content`.

**For non-OpenSpec workflows**: write the document body to a file in the Chorus staging directory and pass its absolute path via `contentPath`. The plugin reads the file and injects its content into the remote Chorus call. Staging files are outside the workspace and are deleted automatically when the session ends.

**For OpenSpec workflows** (`chorus-openspec`): pass the local OpenSpec artifact path (e.g., `openspec/changes/<slug>/proposal.md`) directly.

Passing inline `content` to any of these tools returns a local error and stops the call before it reaches the Chorus server. Paths outside the workspace root and the Chorus staging directory are also rejected.
