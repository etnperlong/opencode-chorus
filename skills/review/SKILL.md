---
name: review
description: Chorus review workflow for OpenCode. Use when preparing for, tracking, or responding to automated proposal and task reviewer comments.
version: 0.7.5
---

# Review Skill

Use Chorus review behavior to track automated reviewer comments:

1. Confirm the proposal or task being reviewed.
2. Count existing `VERDICT:` comments before spawning or respawning a reviewer.
3. Check the newest automated reviewer comment and persisted review state.
4. Interpret verdicts consistently:
   - `VERDICT: PASS` means no blocking issues were found.
   - `VERDICT: PASS WITH NOTES` means all required behavior passed and notes are non-blocking.
   - `VERDICT: FAIL` means BLOCKERs must be fixed before approval or verification.
5. Keep review findings separate from implementation notes when comments include actionable feedback.
6. Address accepted findings with focused changes and verification.

If no new `VERDICT:` comment appears after a reviewer returns, the reviewer likely exhausted its step budget before posting. Respawn it once with a concise-budget hint: "Stay within your step budget. Skip deep verification, batch all Chorus MCP fetches up front, skim for obvious BLOCKERs only, and reserve your last few steps to post the VERDICT comment." If the second attempt also produces no `VERDICT`, review manually against the proposal or task acceptance criteria, record the manual result clearly, and proceed according to that result.

The plugin manages reviewer sessions, review state, and notification routing; do not emulate plugin lifecycle internals manually.
