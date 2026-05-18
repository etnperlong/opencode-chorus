---
name: chorus-openspec
description: Chorus OpenSpec-aware document authoring workflow for OpenCode. Use when a project has an openspec/ directory and openspec CLI for spec-driven proposals, document mirror sync, and archive reminders.
license: AGPL-3.0
compatibility: opencode
metadata:
  author: chorus
  version: "0.8.3"
  category: project-management
  mcp_server: lazy-chorus-bridge
  workflow: openspec-aware
  role: proposal:write
  audience: opencode-agents
  source: chorus-plugin
  keywords: openspec,spec-driven,document-drafts,mirror-sync,archive,proposal
  tools: chorus_pm_add_document_draft,chorus_pm_update_document_draft,chorus_pm_add_task_draft,chorus_pm_update_task_draft
---


# OpenSpec-Aware Skill

Use this skill when the current project uses OpenSpec and Chorus proposals should mirror local OpenSpec change artifacts.

## OpenCode Tool Access

In OpenCode plugin mode, Chorus uses the lazy bridge tools `chorus_tools`, `chorus_tool_get`, and `chorus_tool_execute`. Start with `chorus_tools`, inspect one tool with `chorus_tool_get({ toolName: "..." })`, then execute it with `chorus_tool_execute({ toolName: "...", arguments: { ... } })`.

---

## Detect OpenSpec Mode

At session start or before creating a proposal, detect whether OpenSpec mode is available:

1. Confirm the project root contains `openspec/`.
2. Confirm the `openspec` CLI is available by running `openspec --version` or another harmless read-only OpenSpec command.
3. If either check fails, use the normal `chorus-proposal` workflow and add document drafts inline.
4. If both checks pass, use this OpenSpec-aware workflow.

OpenSpec mode is opt-in per repository. Do not create an `openspec/` directory unless the user explicitly asks to adopt OpenSpec.

---

## Change Creation Flow

When OpenSpec mode is active, create and maintain local OpenSpec artifacts first, then mirror them into Chorus.

1. Pick a short kebab-case change slug that matches the work, for example `add-auth-flow`.
2. Run:
   ```bash
   openspec new change <slug>
   ```
3. Author or update the local OpenSpec artifacts under `openspec/changes/<slug>/`:
   - `proposal.md` for product requirements and why/what/impact.
   - `design.md` for technical design when needed.
   - `specs/**/spec.md` for capability requirements and scenarios.
   - `tasks.md` for implementation tasks and verification steps.
4. Include this marker in the Chorus proposal description:
   ```
   OpenSpec change slug: <slug>
   ```
5. Keep the local OpenSpec artifacts as the source of truth while the proposal is in draft.

---

## Document Type Mapping

| OpenSpec artifact | Chorus document type | Draft title guidance |
|-------------------|----------------------|----------------------|
| `proposal.md` | `prd` | `PRD: <change title>` |
| `design.md` | `tech_design` | `Tech Design: <change title>` |
| `specs/**/spec.md` | `spec` | `Spec: <capability or folder name>` |

`tasks.md` is not a Chorus document draft. Convert each pending task into a Chorus task draft with clear acceptance criteria and dependency links.

---

## Mirror Sync To Chorus Drafts

After local artifacts are written, read each file and mirror it to the Chorus proposal.

For a new draft:

```
chorus_pm_add_document_draft({
  proposalUuid: "<proposal-uuid>",
  type: "prd" | "tech_design" | "spec",
  title: "<mapped title>",
  content: "<exact markdown content from local OpenSpec file>"
})
```

For task drafts, translate `tasks.md` into `chorus_pm_add_task_draft` calls. Preserve task order, acceptance criteria, and dependency DAG. If a task depends on an earlier task, use the earlier response's `draftUuid` in `dependsOnDraftUuids`.

Mirror rules:

- Update local OpenSpec files first.
- Then sync the exact local content to Chorus.
- Add or update task drafts only after the relevant docs are current.
- Add a proposal comment if a mirror sync is partial or blocked.

---

## Post-Approval Document Edits

If the proposal is still in draft, edit local OpenSpec files first and mirror with `chorus_pm_update_document_draft`:

```
chorus_pm_update_document_draft({
  proposalUuid: "<proposal-uuid>",
  draftUuid: "<draft-uuid>",
  content: "<latest markdown content from local OpenSpec file>"
})
```

If the proposal has already been submitted or approved, check the current Chorus status before editing:

- `pending`: the proposal cannot be edited. Reject it back to draft first, then update local OpenSpec files and mirror draft updates.
- `approved`: update the local OpenSpec files first. Then use the appropriate Chorus update tool available for the approved document or create a follow-up proposal if the change alters approved scope.
- If only draft update tools are available in the current tool surface, do not pretend approved documents were synced. Add a comment and ask for the correct governance path.

---

## Archive Trigger

After the last task from an OpenSpec-backed proposal is verified:

1. Check whether all tasks from the proposal are `done` or `closed`.
2. If all tasks are complete, tell the user the OpenSpec change is ready to archive.
3. Suggest running the local archive flow, for example:
   ```bash
   openspec archive <slug>
   ```
4. Do not auto-archive without user confirmation unless the user explicitly requested full automation.

---

## Failure Handling

- If `openspec new change <slug>` fails because the slug exists, inspect the existing change and ask whether to reuse it or choose a new slug.
- If local files and Chorus drafts diverge, treat local OpenSpec artifacts as source of truth while the proposal is draft.
- If Chorus rejects a draft update, keep the local file unchanged and report the sync blocker.
- If OpenSpec CLI is unavailable, continue with the free-form Chorus workflow and note that OpenSpec mode was skipped.

---

## Next

- Use `chorus-proposal` for proposal creation and submission.
- Use `chorus-develop` for task implementation and OpenSpec document updates during development.
- Use `chorus-yolo` when driving a full OpenSpec-backed lifecycle automatically.
