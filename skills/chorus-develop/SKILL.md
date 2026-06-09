---
name: chorus-develop
description: Chorus development workflow for OpenCode. Use when claiming approved tasks, implementing scoped work, reporting progress, self-checking criteria, and submitting for verification.
license: AGPL-3.0
compatibility: opencode
metadata:
  author: chorus
  version: "0.9.4"
  category: project-management
  mcp_server: lazy-chorus-bridge
  workflow: development
  role: task:write
  audience: opencode-agents
  source: chorus-plugin
  keywords: task,implementation,self-check,verification,subagents,work-report
  tools: chorus_claim_task,chorus_update_task,chorus_report_work,chorus_report_criteria_self_check,chorus_submit_for_verify
---


# Develop Skill

This skill covers the **Development** stage of the AI-DLC workflow: claiming Tasks, writing code, reporting progress, submitting for verification, and managing sessions for sub-agent observability.

## OpenCode Tool Access

In OpenCode plugin mode, Chorus uses the lazy bridge tools `chorus_tools`, `chorus_tool_get`, and `chorus_tool_execute`. Start with `chorus_tools`, inspect one tool with `chorus_tool_get({ toolName: "..." })`, then execute it with `chorus_tool_execute({ toolName: "...", arguments: { ... } })`.

---

## Overview

Agents with `task:read` + `task:write` take approved Tasks and turn them into working code. This is usually the `developer_agent` preset, but custom API keys may grant the same matrix entries directly. Each task follows:

```
claim --> in_progress --> report work --> self-check AC --> submit for verify --> Admin chorus-review
```

For multi-agent parallel execution, Chorus integrates with OpenCode subagents (swarm mode) with full session-based observability.

---

## Tools

**Task Lifecycle:**

| Tool | Purpose |
|------|---------|
| `chorus_claim_task` | Claim an open task (open -> assigned) |
| `chorus_release_task` | Release a claimed task (assigned -> open) |
| `chorus_update_task` | Update task status (in_progress / to_verify) |
| `chorus_submit_for_verify` | Submit task for admin verification with summary |

**Work Reporting:**

| Tool | Purpose |
|------|---------|
| `chorus_report_work` | Report progress or completion (writes comment + records activity, with optional status update) |

**Acceptance Criteria:**

| Tool | Purpose |
|------|---------|
| `chorus_report_criteria_self_check` | Report self-check results (passed/failed + optional evidence) on structured acceptance criteria |

**Session (sub-agents only — main agent skips these):**

| Tool | Purpose |
|------|---------|
| `chorus_session_checkin_task` | Checkin to a task before starting work |
| `chorus_session_checkout_task` | Checkout from a task when work is done |

Sub-agents: always pass `sessionUuid` to `chorus_update_task` and `chorus_report_work` for attribution.
Main agent / Team Lead: call these tools without `sessionUuid` — no session needed.

**Shared tools** (checkin, query, comment, search, notifications): see `/chorus`

---

## Workflow

### Step 1: Check In

```
chorus_tool_execute({ toolName: "chorus_checkin", arguments: {} })
```

Review your persona, current assignments, and pending work counts.

### Step 1.5: Get Your Session (Sub-Agents Only)

**Skip if you are the main agent or Team Lead.**

If you are a **sub-agent**, the opencode-chorus plugin automatically creates your session — look for a "Chorus Session" section in your system reminders containing your `sessionUuid`. Keep it for all task operations.

### Step 2: Find Work

```
chorus_tool_execute({ toolName: "chorus_get_available_tasks", arguments: { projectUuid: "<project-uuid>" } })
```

Or check existing assignments:

```
chorus_tool_execute({ toolName: "chorus_get_my_assignments", arguments: {} })
```

### Step 3: Claim a Task

```
chorus_tool_execute({ toolName: "chorus_get_task", arguments: { taskUuid: "<task-uuid>" } })  # Review first
chorus_tool_execute({ toolName: "chorus_claim_task", arguments: { taskUuid: "<task-uuid>" } })
```

Check: description, acceptance criteria, priority, story points, related proposal/documents.

### Step 4: Gather Context

Each task and proposal includes a `commentCount` field — use it to decide which entities have discussions worth reading.

1. **Read the task** and identify dependencies:
   ```
   chorus_tool_execute({ toolName: "chorus_get_task", arguments: { taskUuid: "<task-uuid>" } })
   ```
   Pay attention to `dependsOn` (upstream tasks) and `commentCount`.

2. **Read task comments** (contains previous work reports, progress, feedback):
   ```
   chorus_tool_execute({ toolName: "chorus_get_comments", arguments: { targetType: "task", targetUuid: "<task-uuid>" } })
   ```

3. **Review upstream dependency tasks** — your work likely builds on theirs:
   ```
   chorus_tool_execute({ toolName: "chorus_get_task", arguments: { taskUuid: "<dependency-task-uuid>" } })
   chorus_tool_execute({ toolName: "chorus_get_comments", arguments: { targetType: "task", targetUuid: "<dependency-task-uuid>" } })
   ```
   Look for: files created, API contracts, interfaces, trade-offs.

4. **Read the originating proposal** for design intent:
    ```
    chorus_tool_execute({ toolName: "chorus_get_proposal", arguments: { proposalUuid: "<proposal-uuid>", section: "full" } })
    ```

   Use `section: "full"` when you need the complete proposal, including document and task draft content. Use `section: "documents"` or `section: "tasks"` if only one side is needed.

   If the proposal description or comments include `OpenSpec change slug: <slug>`, treat local OpenSpec files as the document source of truth. When implementation reveals a required document update:
    - In the OpenSpec change directory for `<slug>`, update `proposal.md`, `design.md`, or `specs/**/spec.md` first.
    - Then mirror the updated local file back to Chorus using `contentPath`. Prefer OpenCode's native `write` / `edit` tools over bash-based file writes when updating that local file. For draft proposals, use `chorus_tool_execute({ toolName: "chorus_pm_update_document_draft", arguments: { ..., contentPath: "<path>" } })`; for approved documents, use the available document update/governance path or create a follow-up proposal if the change alters approved scope.
    - Do not update Chorus docs without updating the local OpenSpec artifact first.
    - Add a task comment if the mirror sync is blocked or requires PM/admin input.

5. **Read project documents** (PRD, tech design, ADR):
    ```
   chorus_tool_execute({ toolName: "chorus_get_documents", arguments: { projectUuid: "<project-uuid>" } })
   ```

### Step 5: Start Working

**Sub-agent**: checkin to the task first:
```
chorus_tool_execute({ toolName: "chorus_session_checkin_task", arguments: { sessionUuid: "<session-uuid>", taskUuid: "<task-uuid>" } })
```

Then mark as in-progress:
```
# Sub-agent:
chorus_tool_execute({ toolName: "chorus_update_task", arguments: { taskUuid: "<task-uuid>", status: "in_progress", sessionUuid: "<session-uuid>" } })

# Main agent:
chorus_tool_execute({ toolName: "chorus_update_task", arguments: { taskUuid: "<task-uuid>", status: "in_progress" } })
```

> **Dependency enforcement**: If this task has unresolved dependencies (dependsOn tasks not in `done` or `closed`), the call will be rejected with detailed blocker info. Use `chorus_get_unblocked_tasks` to find tasks you can start now.

### Step 6: Report Progress

Report periodically with `chorus_report_work`. Include:
- What was completed
- Files created or modified
- Git commits and PRs
- Current status / remaining work
- Blockers or questions

```
chorus_tool_execute({ toolName: "chorus_report_work", arguments: {
  taskUuid: "<task-uuid>",
  report: "Progress:\n- Created src/services/auth.service.ts\n- Commit: abc1234\n- Remaining: unit tests",
  sessionUuid: "<session-uuid>"
} })
```

Report with status update when complete:
```
chorus_tool_execute({ toolName: "chorus_report_work", arguments: {
  taskUuid: "<task-uuid>",
  report: "All implementation complete:\n- Files: ...\n- PR: https://github.com/org/repo/pull/42\n- All tests passing",
  status: "to_verify",
  sessionUuid: "<session-uuid>"
} })
```

### Step 7: Self-Check Acceptance Criteria

Before submitting, check structured acceptance criteria:

```
task = chorus_tool_execute({ toolName: "chorus_get_task", arguments: { taskUuid: "<task-uuid>" } })

# If task.acceptanceCriteriaItems is non-empty:
chorus_tool_execute({ toolName: "chorus_report_criteria_self_check", arguments: {
  taskUuid: "<task-uuid>",
  criteria: [
    { uuid: "<criterion-uuid>", devStatus: "passed", devEvidence: "Unit tests cover this" },
    { uuid: "<criterion-uuid>", devStatus: "passed", devEvidence: "Verified manually" }
  ]
} })
```

> For **required** criteria, keep working until you can self-check as `passed`. Only use `failed` for **optional** criteria that are out of scope.

### Step 8: Submit for Verification

**Sub-agents** — checkout first:
```
chorus_tool_execute({ toolName: "chorus_session_checkout_task", arguments: { sessionUuid: "<session-uuid>", taskUuid: "<task-uuid>" } })
```

Then submit:
```
chorus_tool_execute({ toolName: "chorus_submit_for_verify", arguments: {
  taskUuid: "<task-uuid>",
  summary: "Implemented auth feature:\n- Added login/logout endpoints\n- JWT middleware\n- 95% test coverage\n- All AC self-checked (3/3 passed)"
} })
```

> `to_verify` does NOT unblock downstream tasks — only `done` (after admin verification) does.

> **Review Agent:** After `chorus_submit_for_verify`, the opencode-chorus plugin auto-launches `task-reviewer` as an independent, read-only child sub-agent and waits for its current VERDICT or timeout before returning the tool result. The reviewer posts a VERDICT comment on the task.

After the gated reviewer result returns, read its VERDICT from the tool result or comments:
```
chorus_tool_execute({ toolName: "chorus_get_comments", arguments: { targetType: "task", targetUuid: "<task-uuid>" } })
```
Find the most recent comment containing `VERDICT:` and act on it:

- **VERDICT: PASS** — All AC verified, no issues. Proceed to admin verification.
- **VERDICT: PASS WITH NOTES** — All AC verified, minor notes. Proceed to admin verification (notes are non-blocking).
- **VERDICT: FAIL** — BLOCKERs found. Do NOT verify. Fix the BLOCKERs listed in the reviewer's comment, then resubmit.

If the reviewer times out or no current `VERDICT:` comment appears, inspect the reported reviewer child session and Chorus comments. Do not silently proceed: resubmit for another reviewer gate, reopen for more work if evidence is unclear, or escalate for human review.

### Step 9: Handle Review Feedback

If the reviewer returns **FAIL**, or the task is reopened after verification:

**All acceptance criteria are reset to pending** when a task is reopened.

1. Check feedback:
   ```
   chorus_tool_execute({ toolName: "chorus_get_task", arguments: { taskUuid: "<task-uuid>" } })
   chorus_tool_execute({ toolName: "chorus_get_comments", arguments: { targetType: "task", targetUuid: "<task-uuid>" } })
   ```
2. Fix every BLOCKER listed in the reviewer's FAIL comment.
3. Checkin again, fix issues, report fixes, resubmit.

### Step 10: Task Complete

Once Admin verifies (status: `done`), move to the next available task (back to Step 2).

### Step 11: Idea Completion Report (advisory)

If the task you just submitted or helped finish appears to be the **last remaining task of its Idea** and your permission matrix includes `document:write`, offer to create an idea-completion report.

- Use the OpenCode `question` tool to ask whether the user wants the report written now.
- If they agree, call `chorus_create_report` with the proposal UUID and follow the tool description for the Summary / Decisions / Follow-ups sections.
- If they decline, continue normally. The plugin may remind you again after a later admin verification if the proposal is complete and still has no report.

---

## Session (Sub-Agents Only)

The opencode-chorus plugin **fully automates** session lifecycle — creation, heartbeat, and cleanup are all handled by hooks. Sub-agents only do 3 things manually:

1. `chorus_tool_execute({ toolName: "chorus_session_checkin_task", arguments: { sessionUuid, taskUuid } })` — before starting work
2. `chorus_tool_execute({ toolName: "chorus_session_checkout_task", arguments: { sessionUuid, taskUuid } })` — when done (recommended; plugin also auto-checkouts on exit)
3. Pass `sessionUuid` to `chorus_update_task` and `chorus_report_work` for attribution

**Main agent / Team Lead**: no session needed — call tools without `sessionUuid`.

---

## OpenCode subagents Integration

When using OpenCode subagents to run multiple sub-agents in parallel, Chorus provides full work observability.

### Two-Layer Architecture

| Layer | System | Purpose |
|-------|--------|---------|
| **Orchestration** | OpenCode subagents | Spawning sub-agents, task dispatch, inter-agent messaging |
| **Work Tracking** | Chorus | Task lifecycle, session observability, activity stream |

### Team Lead Workflow

```
# 1. Check in and plan
chorus_tool_execute({ toolName: "chorus_checkin", arguments: {} })
chorus_tool_execute({ toolName: "chorus_list_tasks", arguments: { projectUuid: "<project-uuid>" } })

# 2. Start an OpenCode multi-agent workflow and spawn sub-agents
Create or choose an OpenCode multi-agent coordination context for "feature-x".

# Pass only task UUIDs — plugin auto-injects session workflow
task({
  name: "frontend-worker",
  prompt: "Your Chorus task UUID: <task-uuid>\nProject UUID: <project-uuid>\n\nImplement..."
})
```

**What the Team Lead prompt needs:**
- Task UUID(s)
- NO session UUID, NO workflow boilerplate — plugin auto-injects everything

### Sub-Agent Workflow

The plugin injects session UUID and workflow into the sub-agent's context automatically.

```
# 1. Checkin to task
chorus_tool_execute({ toolName: "chorus_session_checkin_task", arguments: { sessionUuid: "<my-session-uuid>", taskUuid: "<my-task-uuid>" } })

# 2. Move to in_progress
chorus_tool_execute({ toolName: "chorus_update_task", arguments: { taskUuid: "<my-task-uuid>", status: "in_progress", sessionUuid: "<my-session-uuid>" } })

# 3. Do work... code, test, commit...

# 4. Report progress
chorus_tool_execute({ toolName: "chorus_report_work", arguments: { taskUuid: "<my-task-uuid>", report: "...", sessionUuid: "<my-session-uuid>" } })

# 5. Checkout and submit
chorus_tool_execute({ toolName: "chorus_session_checkout_task", arguments: { sessionUuid: "<my-session-uuid>", taskUuid: "<my-task-uuid>" } })
chorus_tool_execute({ toolName: "chorus_submit_for_verify", arguments: { taskUuid: "<my-task-uuid>", summary: "..." } })

# 6. Notify team lead
Notify the team lead that the task is complete.

# DO NOT close session — plugin closes it automatically on exit
```

### Handling Task Dependencies (DAG)

> **Server-side enforcement**: `chorus_tool_execute({ toolName: "chorus_update_task", arguments: { status: "in_progress" } })` rejects if any `dependsOn` task is not `done` or `closed`.

**Wave-based execution (recommended):**
1. `chorus_get_unblocked_tasks` — find ready tasks
2. Spawn sub-agents for Wave 1
3. Wait for `to_verify`, then **verify each task** (`chorus_admin_verify_task` → `done`)
4. `chorus_get_unblocked_tasks` — find newly unblocked tasks (Wave 2)
5. Repeat until all tasks done

> **Critical:** `to_verify` does NOT resolve dependencies — only `done` or `closed` does. The Team Lead must verify tasks between waves.

### Multiple Tasks Per Sub-Agent

A single sub-agent can work on multiple tasks sequentially:

```
task({
  name: "full-stack-worker",
  prompt: "Your Chorus tasks (work in order):\n1. task-schema-uuid\n2. task-api-uuid (depends on #1)\n\nFor EACH task: checkin -> in_progress -> work -> report -> checkout -> submit_for_verify"
})
```

### MCP Access for Sub-Agents

Sub-agents need access to the lazy Chorus bridge configured by the opencode-chorus plugin. If tools are missing, confirm `chorusUrl` and `apiKey` are configured for the OpenCode session, then call `chorus_tools`, inspect the needed tool with `chorus_tool_get`, and execute it through `chorus_tool_execute`.

### Troubleshooting

| Problem | Solution |
|---------|----------|
| Sub-agent can't access Chorus MCP tools | Verify MCP is configured at project level and the API key includes the needed matrix entries, usually `task:read` + `task:write` |
| UI doesn't show active workers | Sub-agent forgot `chorus_session_checkin_task`. Check: `chorus_get_session` |
| Session disappears from default views | The session may be stale after about 1h with no activity. Query it via MCP, send a session-touching tool call or heartbeat to refresh visibility, and check whether the agent crashed |
| Task stuck in wrong status | Spawn new sub-agent with same name (plugin auto-reopens session), or use `chorus_update_task` to reset |
| Duplicate sessions | Never call `chorus_create_session` — plugin handles all session creation. Close extras via Settings page |
| Sub-agent didn't receive session | Check plugin is loaded (`/plugin list`) and `CHORUS_URL` is set. Ensure `name` parameter is set |

---

## Work Report Best Practices

**Good report (enables session continuity):**
```
Implemented password reset flow:

Files created/modified:
- src/services/auth.service.ts (new)
- src/app/api/auth/reset/route.ts (new)
- tests/auth/reset.test.ts (new)

Git:
- Commit: a1b2c3d "feat: password reset flow"
- PR: https://github.com/org/repo/pull/15

Implementation details:
- POST /api/auth/reset-request: sends email with token
- Token expires after 1 hour, single-use
- Rate limiting: 3 requests/hour/email
- 12 new tests, all passing

Acceptance criteria:
- [x] User can request reset via email
- [x] Reset link expires after 1 hour
- [x] Rate limiting prevents abuse
```

**Bad report:** `Done.`

---

## Tips

- **Read task comments first** — they contain previous work reports for session continuity
- **Check upstream dependencies** — read `dependsOn` tasks and their comments for interfaces/APIs
- **Read the originating proposal** — understand design rationale and task DAG
- **Use `commentCount`** — skip fetching comments on entities with count 0
- Report progress frequently — include file paths, commits, and PRs
- Write detailed submit summaries — Admin needs them to verify
- If blocked, add a comment and consider releasing the task
- One task at a time: finish or release before claiming another
- Use meaningful sub-agent names — they become Chorus session names

---

## When to Release a Task

Release if:
- You can't complete it (missing knowledge, blocked)
- A higher-priority task needs attention
- You won't finish in a reasonable timeframe

```
chorus_tool_execute({ toolName: "chorus_release_task", arguments: { taskUuid: "<task-uuid>" } })
chorus_tool_execute({ toolName: "chorus_add_comment", arguments: { targetType: "task", targetUuid: "<task-uuid>", content: "Releasing: reason..." } })
```

---

## Next

- After submitting for verification, an Admin reviews using `chorus-review`
- For platform overview and shared tools, see `/chorus`
