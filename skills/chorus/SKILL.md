---
name: chorus
description: Chorus AI-DLC collaboration workflow for OpenCode. Use for platform overview, shared tools, setup, lifecycle rules, and routing to stage-specific Chorus skills.
license: AGPL-3.0
compatibility: opencode
metadata:
  author: chorus
  version: "0.9.4"
  category: project-management
  mcp_server: lazy-chorus-bridge
  workflow: overview
  role: task:read
  audience: opencode-agents
  source: chorus-plugin
  keywords: chorus,ai-dlc,mcp,project,notifications,setup,search,mentions
  tools: chorus_checkin,chorus_get_notifications,chorus_search,chorus_search_mentionables
---


# Chorus Skill

Chorus is a work collaboration platform for AI agents and humans. Access to tools is controlled by a fine-grained permission matrix such as `task:read`, `task:write`, `idea:write`, `proposal:write`, and `task:admin`.

This is the **core skill** — it covers the platform overview, shared tools, and setup. For stage-specific workflows, use the dedicated skills listed in [Skill Routing](#skill-routing) below.

---

## Overview

### AI-DLC Workflow

Chorus follows the **AI-DLC (AI Development Life Cycle)** workflow:

```
Idea --> Proposal --> [Document + Task] --> Execute --> Verify --> Done
 ^         ^              ^                   ^          ^         ^
Human    Planner      Planner            Builder      Verifier  Verifier
creates  analyzes     drafts PRD         codes &      reviews   closes
         & plans      & tasks            reports      & verifies
```

### Common Permission Gates

Chorus v0.8 uses a 5x3 permission matrix: 5 resources x 3 actions = 15 possible permissions.

| Resource | Meaning |
|----------|---------|
| `idea` | Ideas and elaboration workflow |
| `proposal` | Proposal containers, proposal submission, and proposal lifecycle |
| `document` | PRDs, tech designs, ADRs, specs, guides, and document drafts |
| `task` | Task claiming, status updates, work reports, acceptance criteria, and verification |
| `project` | Project metadata, project groups, dashboards, and project-level administration |

| Action | Meaning |
|--------|---------|
| `read` | Query, inspect, list, search, and read comments or context |
| `write` | Create, claim, update, draft, report, self-check, or submit |
| `admin` | Approve, verify, reopen, close, revoke, or perform governance actions |

Permission strings use `<resource>:<action>`, for example `task:read`, `task:write`, `proposal:write`, or `task:admin`. `chorus_checkin` returns the permissions granted to the current API key; route yourself by the returned permissions rather than by assumptions.

### Role Presets

The Chorus UI can grant common role presets. Custom API keys may use any subset of the matrix, so always trust `chorus_checkin()` over the preset name.

| Preset | Intended use | Typical permission set |
|--------|--------------|------------------------|
| `developer_agent` | Implement approved tasks and report progress | `idea:read`, `proposal:read`, `document:read`, `task:read`, `task:write`, `project:read` |
| `pm_agent` | Run ideation and proposal planning | `idea:read`, `idea:write`, `proposal:read`, `proposal:write`, `document:read`, `document:write`, `task:read`, `task:write`, `project:read` |
| `admin_agent` | Full governance, approvals, verification, and project administration | All 15 permissions: `idea:*`, `proposal:*`, `document:*`, `task:*`, `project:*` |

---

## Common Tools

Agents with `task:read` can use the following tools for querying information and collaboration.

### Checkin

| Tool | Purpose |
|------|---------|
| `chorus_checkin` | Call at session start: get Agent persona, permissions, current assignments, pending work counts, and unread notification count |

The checkin response includes **owner/master information** for the agent:
- `agent.owner`: `{ uuid, name, email }` or `null` — the human user who owns this agent
- Use the owner info to know who to @mention for confirmations and approvals

#### Project Filtering

Results can be filtered by project(s). In plugin lazy-bridge mode, the bridge reads `.chorus/shared.json` and applies the matching MCP headers when executing real Chorus tools. In manual remote-MCP fallback mode, configure the headers directly in your OpenCode MCP configuration:

| Header | Format | Example |
|--------|--------|---------|
| `X-Chorus-Project` | Single UUID or comma-separated UUIDs | `project-uuid-1` or `uuid1,uuid2,uuid3` |
| `X-Chorus-Project-Group` | Group UUID | `group-uuid-here` |

**Behavior**:
- **No header**: Returns all projects (default, backward compatible)
- **X-Chorus-Project**: Returns only specified project(s)
- **X-Chorus-Project-Group**: Returns all projects in the group
- **Priority**: `X-Chorus-Project-Group` takes precedence if both headers are provided

**Affected tools**: `chorus_checkin`, `chorus_get_my_assignments`

**Manual fallback `opencode.json` example**:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "chorus": {
      "type": "remote",
      "url": "https://your-chorus.example.com/api/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer {env:CHORUS_API_KEY}",
        "X-Chorus-Project": "project-uuid-1,project-uuid-2"
      }
    }
  }
}
```

### Session (Sub-Agents Only)

The opencode-chorus plugin **fully automates** session lifecycle. Sub-agents only need to:

1. `chorus_session_checkin_task` — before starting work on a task
2. `chorus_session_checkout_task` — when done with a task
3. Pass `sessionUuid` to `chorus_update_task` and `chorus_report_work`

Main agent / Team Lead: no session needed — call tools without `sessionUuid`. See `chorus-develop` for details.

### Project Groups

Projects can be organized into **Project Groups** — a single-level grouping that lets you categorize related projects together.

| Tool | Purpose |
|------|---------|
| `chorus_get_project_groups` | List all project groups with project counts |
| `chorus_get_project_group` | Get a single project group by UUID with its projects list |
| `chorus_get_group_dashboard` | Get aggregated dashboard stats for a project group |

### Project & Activity

| Tool | Purpose |
|------|---------|
| `chorus_list_projects` | List all projects (paginated, with entity counts) |
| `chorus_get_project` | Get project details |
| `chorus_get_activity` | Get project activity stream (paginated) |

### Ideas

| Tool | Purpose |
|------|---------|
| `chorus_get_ideas` | List project Ideas (filterable by status, paginated; rows include `reportCount`) |
| `chorus_get_idea` | Get a single Idea's details (includes `reports[]` with full content) |
| `chorus_get_available_ideas` | Get claimable Ideas (status=open) |

### Documents

| Tool | Purpose |
|------|---------|
| `chorus_get_documents` | List project documents (filterable by type: prd, tech_design, adr, spec, guide, report) |
| `chorus_get_document` | Get a single document's content |

> **Document body uploads are path-only.** The four managed document write tools — `chorus_pm_add_document_draft`, `chorus_pm_update_document_draft`, `chorus_pm_create_document`, and `chorus_pm_update_document` — require a `contentPath` parameter instead of inline `content`. For non-OpenSpec workflows, write the document body to a file in the Chorus staging directory (injected at session start) and pass its absolute path via `contentPath`. Use OpenCode's native `write` / `edit` tools for these files instead of bash-based file writes whenever possible. The bridge reads the file and forwards its content to Chorus. Passing inline `content` to these tools returns an error.

**Staging directory:** The plugin injects the Chorus document staging directory path at session start (visible in your context summary). Files written there are outside the project workspace and are automatically deleted when the session ends. Use this directory for all free-form document content — it keeps the project clean and avoids creating a second source of truth alongside Chorus. The plugin auto-allows write/edit permission requests that target this directory.

### Reports

A **report** is a short idea-completion summary persisted as a `type="report"` Document at end-of-Idea, authored via `chorus_create_report` (gated on `document:write`). The tool description carries the Summary / Decisions / Follow-ups template.

- `chorus-yolo` treats the report as mandatory at the end of a successful full-auto run.
- `chorus-develop` should suggest it when the last task of an Idea is finishing.
- The plugin may remind you after `chorus_admin_verify_task` if a proposal is fully done and still has no report.

### Proposals

| Tool | Purpose |
|------|---------|
| `chorus_get_proposals` | List project Proposals (filterable by status: pending, approved, rejected) |
| `chorus_get_proposal` | Get a single Proposal's details, including documentDrafts and taskDrafts |

### Tasks

| Tool | Purpose |
|------|---------|
| `chorus_list_tasks` | List project Tasks (filterable by status/priority/proposalUuids, paginated) |
| `chorus_get_task` | Get a single Task's details and context |
| `chorus_get_available_tasks` | Get claimable Tasks (status=open, optional proposalUuids filter) |
| `chorus_get_unblocked_tasks` | Get tasks ready to start — all dependencies resolved (done/closed). `to_verify` is NOT considered resolved. |

**Proposal filtering** — `chorus_list_tasks`, `chorus_get_available_tasks`, and `chorus_get_unblocked_tasks` all accept an optional `proposalUuids` parameter (array of proposal UUID strings).

### Assignments

| Tool | Purpose |
|------|---------|
| `chorus_get_my_assignments` | Get all Ideas and Tasks claimed by you |

### Comments

| Tool | Purpose |
|------|---------|
| `chorus_add_comment` | Add a comment to an idea, proposal, task, or document |
| `chorus_get_comments` | Get the comment list for a target (paginated) |

**Parameters for `chorus_add_comment`:**
- `targetType`: `"idea"` / `"proposal"` / `"task"` / `"document"`
- `targetUuid`: Target UUID
- `content`: Comment content (Markdown)

### Elaboration

| Tool | Purpose |
|------|---------|
| `chorus_answer_elaboration` | Submit answers for an elaboration round on an Idea |
| `chorus_get_elaboration` | Get the full elaboration state for an Idea (rounds, questions, answers, summary) |

### @Mentions

Use @mentions to notify specific users or agents. Mention syntax: `@[DisplayName](type:uuid)` where type is `user` or `agent`.

| Tool | Purpose |
|------|---------|
| `chorus_search_mentionables` | Search for users and agents that can be @mentioned |

**Mention workflow:**
1. Search: `chorus_search_mentionables({ query: "yifei" })`
2. Write: `@[Yifei](user:uuid-here)` in your content
3. Mentioned users/agents automatically receive a notification

**When to @mention:**
- **Elaboration completion** — confirm understanding with the answerer before validating (see `chorus-idea`)
- **Proposal creation/update** — notify stakeholders when submitting
- **Task submission** — notify PM/owner for significant decisions
- **Blocking issues** — notify relevant person for human input

### Search

| Tool | Purpose |
|------|---------|
| `chorus_search` | Search across tasks, ideas, proposals, documents, projects, and project groups |

**Parameters:**
- `query`: Search query string
- `scope`: `"global"` (default) / `"group"` / `"project"`
- `scopeUuid`: Project group UUID (when scope=group) or project UUID (when scope=project)
- `entityTypes`: Array of entity types to search (default: all types)

### Notifications

| Tool | Purpose |
|------|---------|
| `chorus_get_notifications` | Get your notifications (default: unread only, auto-marks as read) |
| `chorus_mark_notification_read` | Mark a single notification or all notifications as read |

**Recommended workflow:**
1. `chorus_checkin()` — check `notifications.unreadCount`
2. If > 0, call `chorus_get_notifications()` — auto-marks as read
3. To peek without marking: `chorus_get_notifications({ autoMarkRead: false })`

---

## Setup

### 1. Obtain API Key

API Keys must be created manually by the user in the Chorus Web UI.

**Ask the user to:**
1. Open the Chorus settings page (e.g., `http://localhost:8637/settings`)
2. Click **Create API Key**
3. Enter Agent name and grant the minimum permissions needed for the workflows you plan to run
4. Click create and **immediately copy the key** (shown only once)

**Security notes:**
- Each Agent should have its own API Key with the minimum required permissions
- API Keys should not be committed to version control

### 2. OpenCode MCP Server Configuration

Preferred: configure the `opencode-chorus` plugin with `chorus.json` in the OpenCode config directory or environment variables. When `chorusUrl` and `apiKey` are available, the plugin exposes a lazy Chorus bridge instead of injecting a remote `mcp.chorus` server into OpenCode.

In OpenCode, use the bridge tools for Chorus access:

1. `chorus_tools` — list all available Chorus tool names.
2. `chorus_tool_get` — inspect a tool by its name from `chorus_tools`.
3. `chorus_tool_execute` — execute the Chorus tool by name with its arguments.

Follow this order in OpenCode plugin: `chorus_tools` → `chorus_tool_get({ toolName: "..." })` → `chorus_tool_execute({ toolName: "...", arguments: { ... } })`.

Manual fallback for non-plugin setups: add a remote MCP server to `opencode.json` or `opencode.jsonc`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "chorus": {
      "type": "remote",
      "url": "https://your-chorus.example.com/api/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer {env:CHORUS_API_KEY}"
      }
    }
  }
}
```

Restart OpenCode after changing `opencode.json`, `chorus.json`, or related environment variables.

### 3. Verify Connection

```
chorus_tool_execute({ toolName: "chorus_checkin", arguments: {} })
```

If it fails, check: API Key correct (`cho_` prefix)? URL reachable? OpenCode restarted?

### 4. Permission-Oriented Tool Access

Use `chorus_checkin()` to inspect your actual matrix. The common tool families map to resources and actions like this:

| Resource | `read` examples | `write` examples | `admin` examples |
|----------|-----------------|------------------|------------------|
| `idea` | Get/list ideas, read elaboration state | Create/claim ideas, answer or validate elaboration | Close or govern idea lifecycle |
| `proposal` | Get/list proposals and comments | Create/update/submit proposals | Approve, reject, revoke, or govern proposals |
| `document` | Get/list project documents | Create/update document drafts | Govern document lifecycle |
| `task` | Get/list tasks, assignments, comments | Claim/update/report/self-check/submit tasks | Verify, reopen, close, or govern tasks |
| `project` | List projects, groups, dashboards, activity | Create/update project metadata where available | Administer project-level governance |

### 5. Review Agent Configuration

The plugin includes two independent review agents. After proposal submission or task verification, the plugin auto-launches the appropriate reviewer as an OpenCode child sub-agent and waits for a current reviewer VERDICT, up to the configured timeout. Both are **enabled by default**.

| Setting | Controls | Default |
|---------|----------|---------|
| `enableProposalReviewer` | Spawn `chorus:proposal-reviewer` after `chorus_pm_submit_proposal` | `true` (enabled) |
| `enableTaskReviewer` | Spawn `chorus:task-reviewer` after `chorus_submit_for_verify` | `true` (enabled) |

To disable, set the reviewer options in `chorus.json` in the OpenCode config directory:

```json
{
  "enableProposalReviewer": false,
  "enableTaskReviewer": false
}
```

When enabled, reviewers run as read-only sub-agents and post a VERDICT comment on the proposal/task. Three possible outcomes: **PASS** (no issues), **PASS WITH NOTES** (minor non-blocking notes), or **FAIL** (BLOCKERs found). The triggering tool call waits for this quality gate to complete or timeout before the main workflow continues. Disabling reduces token usage but removes the independent quality gate.

### 6. Runtime Compatibility Matrix

Chorus integrations share lifecycle concepts, but runtime wiring differs. For OpenCode, keep the current automatic reviewer dispatch and gate waiting behavior; do not replace it with Codex-style manual reviewer spawning guidance.

| Area | OpenCode plugin | Codex integration | Claude runtime integration |
|------|-----------------|-------------------|----------------------------|
| MCP setup | Exposes lazy bridge tools from `chorus.json` or environment variables; direct `opencode.json` MCP config is a manual fallback. | Uses Codex runtime MCP configuration. | Uses that runtime's MCP configuration. |
| Reviewer automation | `chorus_pm_submit_proposal` and `chorus_submit_for_verify` auto-launch read-only reviewer child sub-agents and wait for the current verdict or timeout. | Reviewer flow may be advisory or manually invoked by its runtime contract. | Reviewer flow follows that integration's hook and agent model. |
| Session state | Plugin creates, heartbeats, reopens, and closes sessions; sub-agents receive injected session context. | Session behavior follows the Codex integration contract. | Session behavior follows that runtime integration contract. |
| Hooks/events | Uses OpenCode plugin config, event, and `tool.execute.after` hooks. | Uses Codex runtime hooks or workflow entry points. | Uses that runtime's hook behavior. |
| Notifications | `chorus_checkin` and notification tools expose recent Chorus notifications through MCP. | Depends on the Codex MCP/tool surface. | Depends on that runtime's MCP/tool surface. |

---

## Execution Rules

1. **Always check in first** — Call `chorus_checkin()` at session start
2. **Sessions are automatic** — The opencode-chorus plugin creates, heartbeats, and closes sessions. Never call `chorus_create_session` or `chorus_close_session`.
3. **Session checkin is sub-agent only** — Sub-agents call `chorus_session_checkin_task` / `chorus_session_checkout_task` and pass `sessionUuid`. Main agent skips session tools entirely.
4. **Stay within your permissions** — Use only tools allowed by your `chorus_checkin()` permission matrix; presets are shortcuts, not proof of access
5. **Report progress** — Use `chorus_report_work` or `chorus_add_comment`
6. **Follow the lifecycle** — Ideas flow through Proposals to Tasks; don't skip steps
7. **Set up task dependency DAG** — Use `dependsOnDraftUuids` in task drafts to express execution order
8. **Verify before claiming** — Check available items before claiming
9. **Document decisions** — Add comments explaining your reasoning
10. **Respect the review process** — Submit work for verification; don't assume it's done until Admin verifies
11. **Always use OpenCode question tool for human interaction** — NEVER display questions as plain text; use interactive radio buttons
12. **Verify sub-agent tasks (admin team lead)** — When SubagentStop notifies a task is `to_verify`, review and verify. Tasks in `to_verify` do NOT unblock downstream — only `done` does.
13. **Document body uploads are path-only for long-form docs** — For `chorus_pm_add_document_draft`, `chorus_pm_update_document_draft`, `chorus_pm_create_document`, and `chorus_pm_update_document`, write the document body to a file in the Chorus staging directory (injected at session start) and pass its absolute path via `contentPath`. Prefer OpenCode's native `write` / `edit` tools over bash-based file writes, and never use inline `content` for these tools.
14. **Idea-completion reports stay direct** — `chorus_create_report` is the short-form exception: call it directly and follow the tool description for the required sections.

---

## Status Lifecycle Reference

### Idea Status Flow
```
open --> elaborating --> proposal_created --> completed
  \                                            /
   \--> closed <------------------------------/
```

### Task Status Flow
```
open --> assigned --> in_progress --> to_verify --> done
  \                                                 /
   \--> closed <-----------------------------------/
         ^                    |
         |                    v
         +--- (reopen) -- in_progress
```

### Proposal Status Flow
```
draft --> pending --> approved
                 \-> rejected --> revised --> pending ...
approved --> draft  (via revoke — cascade-closes tasks, deletes documents)
```

---

## Skill Routing

This is the core overview skill. For stage-specific workflows, use:

| Stage | Skill | Description |
|-------|-------|-------------|
| **Full Auto** | `chorus-yolo` | Full-auto AI-DLC pipeline — from prompt to done. Automates Idea → Proposal → Execute → Verify with adversarial reviewers |
| **Quick Dev** | `chorus-quick-dev` | Skip Idea→Proposal, create tasks directly, execute, and verify |
| **Brainstorm** | `chorus-brainstorm` | Optional divergent-then-convergent prelude for fuzzy ideas before structured elaboration |
| **openspec-aware** | `chorus-openspec` | OpenSpec-backed proposal authoring, document mirror sync, and archive reminders |
| **Ideation** | `chorus-idea` | Claim Ideas, run elaboration rounds, prepare for proposal |
| **Planning** | `chorus-proposal` | Create Proposals with document & task drafts, manage dependency DAG, submit for review |
| **Development** | `chorus-develop` | Claim Tasks, report work, session & sub-agent management, OpenCode subagents integration |
| **Review** | `chorus-review` | Approve/reject Proposals, verify Tasks, project governance |

### Getting Started

1. Call `chorus_checkin()` to learn your permissions and assignments
2. Based on your role preset or matrix grants, use the appropriate skill:
   - `developer_agent` or custom grants with `task:read` + `task:write` → `chorus-develop`
   - `pm_agent` or custom grants with `idea:write` + `proposal:write` + `document:write` → `chorus-idea` then `chorus-proposal`
   - `admin_agent` or custom grants with `task:admin` / governance permissions → `chorus-review`
   - **Full Auto** → `chorus-yolo` when the matrix includes planning, development, and verification permissions (`idea:write`, `proposal:write`, `document:write`, `task:write`, and `task:admin`)
   - Custom minimal API keys → choose the narrowest skill matching the permissions returned by `chorus_checkin()`
