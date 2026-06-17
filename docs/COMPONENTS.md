# Components

This document describes all components provided by `opencode-chorus`.

## Lifecycle Hooks

### State Management

Keeps reviewer state and notification delivery data in OpenCode's per-user state directory. Supports global (platform-specific) and project-local storage modes. Handles legacy `.chorus/` migration on first startup. Chorus activation state is runtime-only and is not persisted.

### Lazy MCP Bridge

Exposes `chorus_tools`, `chorus_tool_get`, `chorus_tool_execute`, and `chorus_workspace_context` without connecting to Chorus at plugin load time. The first bridge call runs readiness, refreshes real Chorus tools from the Chorus MCP server, starts notification listening, and marks the runtime as activated.

### Managed Context Injection

Injects a bounded `Chorus Context` summary into the native agent's system prompt only after Chorus activation. Includes project scope (managed / unmanaged / ambiguous), owner metadata, permission scope, and OpenSpec availability. Adds a concise per-turn reminder for main sessions, task workflow guidance for detected sub-sessions, AI-DLC guidance for the `plan` agent, and staging directory guidance only once per hook lifecycle.

### Notification Coordination

Starts listening for Chorus SSE notifications only after on-demand readiness succeeds. Routes supported notifications into OpenCode's assistant turn queue, supports project-scoped delivery via `projectUuids`, runs backfill catch-up from checkpoints on connect/reconnect, and preserves main-session handoff ownership.

### Permission Auto-Allow

Auto-allows OpenCode `write` / `edit` permission requests targeting the Chorus staging directory, removing redundant prompts during document-upload workflows.

## Review Agents

### Proposal Reviewer

Automated review agent that evaluates proposals and waits for verdicts. Runs as a dedicated OpenCode child agent with a 40-step budget. Includes anti-rubber-stamp guidance, hallucination checks, and adversarial probes.

### Task Reviewer

Automated review agent that verifies completed tasks against acceptance criteria. Runs as a dedicated OpenCode child agent with a 50-step budget. Includes structured pass/fail evidence for each criterion.

Both reviewers produce structured output with verdict lines (`VERDICT: PASS`, `VERDICT: PASS WITH NOTES`, `VERDICT: FAIL`) and require `Review-Job-ID: <sessionId>` in comments.

## Workflow Skills

| Skill | Description |
|---|---|
| `chorus` | Entry-point skill. Platform overview, shared tools, lifecycle rules, and routing to stage-specific skills. |
| `chorus-idea` | Claim ideas, run elaboration rounds, clarify requirements, and prepare proposal-ready context. |
| `chorus-proposal` | Draft PRDs, tech designs, task dependency graphs, and acceptance criteria. |
| `chorus-develop` | Claim approved tasks, implement scoped work, report progress, self-check criteria, and submit for verification. |
| `chorus-quick-dev` | Handle small approved changes, hotfixes, and quick tasks with optional admin self-verification. |
| `chorus-review` | Approve or reject proposals, verify tasks, interpret reviewer verdicts, and manage project governance. |
| `chorus-yolo` | Full-auto AI-DLC pipeline from prompt to completion with reviewer loops and task waves. |
| `chorus-openspec` | OpenSpec-aware proposal authoring, document draft mirroring, and archive reminders. Requires `openspec/` directory and CLI. |

## TUI Toast Notifications

Reviewer toast notifications display target names, review rounds, completion verdicts, and aggregate multiple concurrently running reviewers without exposing reviewer session IDs.

## Workspace Context Tool

`chorus_workspace_context` is a local-only tool for explicitly binding or unbinding the current workspace to a Chorus project UUID with TUI toast confirmation.

| Action | Description |
|---|---|
| `bind_project` | Persist a Chorus project UUID for this workspace |
| `unbind_project` | Clear the project binding |
| `show` | Inspect current workspace context |
