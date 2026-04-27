---
name: develop
description: Chorus development workflow for OpenCode. Use when implementing approved Chorus tasks with tracked scope and review readiness.
version: 0.7.5
---

# Develop Skill

Use the development workflow for approved Chorus tasks:

1. Confirm the active task and acceptance criteria.
2. Keep implementation scoped to the approved task.
3. Update todos as work progresses.
4. Run appropriate verification before requesting review.
5. Hand off completed work through the Chorus review path.
6. Find the most recent reviewer comment containing `VERDICT:` and act on it:
   - `VERDICT: PASS` means all required behavior passed; proceed to admin verification.
   - `VERDICT: PASS WITH NOTES` means all required behavior passed with non-blocking notes; proceed to admin verification.
   - `VERDICT: FAIL` means BLOCKERs were found; fix the BLOCKERs, verify, and resubmit.

If no new `VERDICT:` comment appears after the task reviewer returns, it likely exhausted its step budget before posting. Respawn it once with a concise-budget hint: "Stay within your step budget. Skip deep verification. Fetch task, proposal, and comments; run only the core tests tied to the task; and post your VERDICT comment within the first 12 steps." If the second attempt still produces no `VERDICT`, review manually against the task acceptance criteria, record the manual result clearly, and proceed only if the manual result is pass or pass-with-notes.

Do not modify Chorus lifecycle files manually; the plugin records session and task state.
