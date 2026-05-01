# opencode-chorus

The [Chorus](https://github.com/Chorus-AIDLC/Chorus) integration plugin for OpenCode. 

This plugin connects OpenCode to your Chorus instance, letting you manage proposals, execute tasks, and run the AI-DLC pipeline.

## Changelog

Release notes are tracked in [CHANGELOG.md](./CHANGELOG.md).

## Features

When enabled, `opencode-chorus` loads Chorus workflow skills and exposes a lazy Chorus tool bridge inside OpenCode. You don't need to configure tools or link skill directories manually.

The plugin provides lifecycle hooks, 7 workflow skills, and 2 review agents for the AI-DLC process.

### Components

| Feature Category | Components | Description |
|---|---|---|
| **Lifecycle Hooks** | State Management | Keeps your OpenCode session state in sync with the `.chorus` directory. |
| | Lazy MCP Bridge | Exposes `chorus_tool_explore` and `chorus_tool_execute`, then discovers real Chorus tools from the Chorus MCP server on demand. |
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

Alternatively, you can create a `chorus.json` file in your OpenCode configuration directory (`~/.config/opencode/chorus.json`):

```json
{
  "chorusUrl": "http://localhost:3000",
  "enableProposalReviewer": true,
  "enableTaskReviewer": true,
  "enableSessionContextSummary": true,
  "enableNotificationHints": true,
  "reviewGateOutputMode": "summary"
}
```
*Note: While you can put your API key in `chorus.json`, using the `CHORUS_API_KEY` environment variable is strongly recommended for security.*

Observability behavior:

- `enableSessionContextSummary` controls one concise startup/resume Chorus context summary. When disabled, context is still stored locally for recovery, but no proactive summary is shown.
- `enableNotificationHints` controls actionable text on routed notification queue entries. When disabled, supported notifications are still queued without hint text.
- `reviewGateOutputMode` controls reviewer gate output verbosity. `summary` keeps output concise; `detailed` includes expanded reviewer job, round, target, comment, timeout, escalation, and verdict details.

These settings only control visibility and hints. They do not auto-claim tasks, approve proposals, or verify tasks.

### Lazy Chorus Tools

The plugin no longer injects a remote `mcp.chorus` server into OpenCode by default. Instead, it exposes two native bridge tools:

- `chorus_tool_explore` searches or inspects real Chorus tools from the remote Chorus MCP server.
- `chorus_tool_execute` executes a real Chorus tool by name (or its short alias) after applying the plugin's argument-safety policy.

For example, to update a task status, first explore `chorus_update_task`, then execute it through the bridge. The bridge keeps the real Chorus tool list in session memory and refreshes it when sessions start or resume.

### 3. Restart OpenCode

After installing the plugin and setting your credentials, restart OpenCode.

You will see the Chorus skills in your workspace. Start by asking OpenCode to use the `chorus` skill for an overview, or run a specific stage like `chorus-idea` or `chorus-yolo`.
