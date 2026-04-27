---
description: Chorus proposal workflow for OpenCode. Use when creating proposals, document drafts, task drafts, acceptance criteria, and dependency DAGs.
version: 0.7.5
---

# Proposal Skill

Before implementation, work through the planning scope:

1. Create or identify the Chorus proposal with `chorus_create_proposal`
2. Prepare document and task drafts with `chorus_add_document_draft` and `chorus_add_task_draft`
3. Set task dependencies with `chorus_update_task_draft`
4. Submit the proposal with `chorus_pm_submit_proposal` or confirm approved-task path

The plugin tracks these steps through planning state and todos.
