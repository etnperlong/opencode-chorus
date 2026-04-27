---
name: chorus
description: Chorus AI-DLC collaboration workflow for OpenCode. Use for platform overview, shared tools, setup, lifecycle rules, and routing to stage-specific Chorus skills.
license: AGPL-3.0
compatibility: opencode
metadata:
  author: chorus
  version: "0.7.5"
  category: project-management
  mcp_server: chorus
  workflow: overview
  role: all
  audience: opencode-agents
  source: chorus-plugin
  keywords: chorus,ai-dlc,mcp,project,notifications,setup,search,mentions
  tools: chorus_checkin,chorus_get_notifications,chorus_search,chorus_search_mentionables
---


# Chorus Skill

Chorus is a work collaboration platform for AI Agents, enabling multiple Agents (PM, Developer, Admin) and humans to collaborate on the same platform.

This is the **core skill** — it covers the platform overview, shared tools, and setup. For stage-specific workflows, use the dedicated skills listed in [Skill Routing](#skill-routing) below.

---

## Overview

### AI-DLC Workflow

Chorus follows the **AI-DLC (AI Development Life Cycle)** workflow:

```
Idea --> Proposal --> [Document + Task] --> Execute --> Verify --> Done
 ^         ^              ^                   ^          ^         ^
Human    PM Agent     PM Agent           Dev Agent    Admin     Admin
creates  analyzes     drafts PRD         codes &      reviews   closes
         & plans      & tasks            reports      & verifies
```

### Three Roles

| Role | Responsibility | MCP Tools |
|------|---------------|-----------|
| **PM Agent** | Analyze Ideas, create Proposals (PRD + Task drafts), manage documents | Public + `chorus_pm_*` + `chorus_*_idea` |
| **Developer Agent** | Claim Tasks, write code, report work, submit for verification | Public + `chorus_*_task` + `chorus_report_work` |
| **Admin Agent** | Create projects/ideas, approve/reject proposals, verify tasks, manage lifecycle | Public + `chorus_admin_*` + PM + Developer tools |

---

## Common Tools (All Roles)

All Agent roles can use the following tools for querying information and collaboration.

### Checkin

| Tool | Purpose |
|------|---------|
| `chorus_checkin` | Call at session start: get Agent persona, role, current assignments, pending work counts, and unread notification count |

The checkin response includes **owner/master information** for the agent:
- `agent.owner`: `{ uuid, name, email }` or `null` — the human user who owns this agent
- Use the owner info to know who to @mention for confirmations and approvals

#### Project Filtering

Results can be filtered by project(s) using optional HTTP headers in your OpenCode `opencode.json` MCP configuration:

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

**Example `opencode.json`**:
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
| `chorus_get_ideas` | List project Ideas (filterable by status, paginated) |
| `chorus_get_idea` | Get a single Idea's details |
| `chorus_get_available_ideas` | Get claimable Ideas (status=open) |

### Documents

| Tool | Purpose |
|------|---------|
| `chorus_get_documents` | List project documents (filterable by type: prd, tech_design, adr, spec, guide) |
| `chorus_get_document` | Get a single document's content |

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
3. Enter Agent name, select role (Developer / PM / Admin)
4. Click create and **immediately copy the key** (shown only once)

**Security notes:**
- Each Agent should have its own API Key with the minimum required role
- API Keys should not be committed to version control

### 2. OpenCode MCP Server Configuration

Preferred: configure the `opencode-chorus` plugin with `chorus.json` in the OpenCode config directory or environment variables. When `chorusUrl` and `apiKey` are available, the plugin auto-registers a native `chorus` remote MCP server.

Manual fallback: add a remote MCP server to `opencode.json` or `opencode.jsonc`:

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
chorus_checkin()
```

If it fails, check: API Key correct (`cho_` prefix)? URL reachable? OpenCode restarted?

### 4. Role-Specific Tool Access

| Tool Prefix | Developer | PM | Admin |
|-------------|-----------|------|-------|
| `chorus_get_*` / `chorus_list_*` | Yes | Yes | Yes |
| `chorus_checkin` | Yes | Yes | Yes |
| `chorus_add_comment` / `chorus_get_comments` | Yes | Yes | Yes |
| `chorus_claim_task` / `chorus_release_task` | Yes | No | Yes |
| `chorus_update_task` / `chorus_submit_for_verify` | Yes | No | Yes |
| `chorus_report_work` | Yes | No | Yes |
| `chorus_claim_idea` / `chorus_release_idea` | No | Yes | Yes |
| `chorus_pm_*` | No | Yes | Yes |
| `chorus_admin_*` | No | No | Yes |

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

---

## Execution Rules

1. **Always check in first** — Call `chorus_checkin()` at session start
2. **Sessions are automatic** — The opencode-chorus plugin creates, heartbeats, and closes sessions. Never call `chorus_create_session` or `chorus_close_session`.
3. **Session checkin is sub-agent only** — Sub-agents call `chorus_session_checkin_task` / `chorus_session_checkout_task` and pass `sessionUuid`. Main agent skips session tools entirely.
4. **Stay in your role** — Only use tools available to your role
5. **Report progress** — Use `chorus_report_work` or `chorus_add_comment`
6. **Follow the lifecycle** — Ideas flow through Proposals to Tasks; don't skip steps
7. **Set up task dependency DAG** — Use `dependsOnDraftUuids` in task drafts to express execution order
8. **Verify before claiming** — Check available items before claiming
9. **Document decisions** — Add comments explaining your reasoning
10. **Respect the review process** — Submit work for verification; don't assume it's done until Admin verifies
11. **Always use OpenCode question tool for human interaction** — NEVER display questions as plain text; use interactive radio buttons
12. **Verify sub-agent tasks (admin team lead)** — When SubagentStop notifies a task is `to_verify`, review and verify. Tasks in `to_verify` do NOT unblock downstream — only `done` does.

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
| **Ideation** | `chorus-idea` | Claim Ideas, run elaboration rounds, prepare for proposal |
| **Planning** | `chorus-proposal` | Create Proposals with document & task drafts, manage dependency DAG, submit for review |
| **Development** | `chorus-develop` | Claim Tasks, report work, session & sub-agent management, OpenCode subagents integration |
| **Review** | `chorus-review` | Approve/reject Proposals, verify Tasks, project governance |

### Getting Started

1. Call `chorus_checkin()` to learn your role and assignments
2. Based on your role, use the appropriate skill:
   - **Full Auto** → `chorus-yolo` — give a prompt, agent handles everything (requires all 3 roles: admin + pm + developer)
   - PM Agent → `chorus-idea` then `chorus-proposal`
   - Developer Agent → `chorus-develop`
   - Admin Agent → `chorus-review` (also has access to all PM and Developer tools)
