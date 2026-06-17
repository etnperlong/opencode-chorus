---
name: chorus-brainstorm
description: Chorus brainstorm workflow for OpenCode. Use as an optional prelude when an idea is still fuzzy and needs divergent-then-convergent exploration before structured elaboration.
license: AGPL-3.0
compatibility: opencode
metadata:
  author: chorus
  version: "0.10.0"
  category: project-management
  mcp_server: lazy-chorus-bridge
  workflow: brainstorm
  role: idea:write
  audience: opencode-agents
  source: chorus-plugin
  keywords: brainstorm,idea,elaboration,decision-points,requirements
  tools: chorus_pm_start_elaboration,chorus_answer_elaboration
---


# Brainstorm Skill

Use this skill only as an optional prelude to `chorus-idea` when the idea direction is still fuzzy and you cannot yet write good structured elaboration questions.

## OpenCode Tool Access

In OpenCode plugin mode, Chorus uses the lazy bridge tools `chorus_tools`, `chorus_tool_get`, and `chorus_tool_execute`. Start with `chorus_tools`, inspect one tool with `chorus_tool_get({ toolName: "..." })`, then execute it with `chorus_tool_execute({ toolName: "...", arguments: { ... } })`.

---

## When To Use It

- Use only after the user explicitly opts into a brainstorm prelude.
- Use only while running the `chorus-idea` workflow.
- Do not use it for already-clear ideas where structured elaboration questions are easy to write.

This skill produces one persisted ElaborationRound and then returns control to `chorus-idea`.

---

## Hard Rules

1. **One question at a time** — each OpenCode `question` call during divergence must contain exactly one question entry.
2. **Prefer concrete choices** — use 2-4 options when possible; open-ended text is allowed only when options would be premature.
3. **Offer 2-3 directions before converging** — once the space is clear enough, propose distinct approaches and recommend exactly one.
4. **Wait for explicit approval** — do not synthesize the round until the user chooses a direction.
5. **No file writes** — do not write markdown files, scratch notes, or design docs.
6. **No comments** — do not call `chorus_add_comment` from this skill.
7. **No validate call** — do not call `chorus_pm_validate_elaboration`; `chorus-idea` decides whether to resolve or open a follow-up round.

---

## Step-by-Step

### 1. Gather Context

Before asking the first question, read the current idea and nearby project context:

```
chorus_tool_execute({ toolName: "chorus_get_idea", arguments: { ideaUuid: "<idea-uuid>" } })
chorus_tool_execute({ toolName: "chorus_get_documents", arguments: { projectUuid: "<project-uuid>" } })
chorus_tool_execute({ toolName: "chorus_get_document", arguments: { documentUuid: "<document-uuid>" } })
chorus_tool_execute({ toolName: "chorus_get_proposals", arguments: { projectUuid: "<project-uuid>", status: "approved" } })
chorus_tool_execute({ toolName: "chorus_list_tasks", arguments: { projectUuid: "<project-uuid>" } })
chorus_tool_execute({ toolName: "chorus_get_comments", arguments: { targetType: "idea", targetUuid: "<idea-uuid>" } })
```

Look for: stated goals, constraints, success criteria, and what is still conspicuously missing.

### 2. Divergent Q&A

Ask one question at a time with the OpenCode `question` tool. Focus on:

- the goal the idea is trying to serve,
- the constraints that rule out whole solution branches,
- the success criteria that define "done".

Example:

```
question({
  questions: [
    {
      header: "Goal",
      question: "What matters most for the first version?",
      options: [
        { label: "Faster delivery", description: "Optimize for shortest path to a working V1" },
        { label: "Best UX", description: "Optimize for the most polished experience" },
        { label: "Lowest risk", description: "Optimize for compatibility and easy rollback" }
      ]
    }
  ]
})
```

### 3. Propose 2-3 Directions

When the solution space is clear enough, ask one convergence question with 2-3 distinct directions and mark exactly one as recommended.

```
question({
  questions: [
    {
      header: "Direction",
      question: "Which approach should we take?",
      options: [
        { label: "Incremental rollout (Recommended)", description: "Smallest change set, lowest migration risk" },
        { label: "Full redesign", description: "Higher impact, cleaner long-term structure" },
        { label: "Adapter layer", description: "Preserve old behavior while introducing the new path" }
      ]
    }
  ]
})
```

### 4. Wait For Explicit Approval

If the user does not approve one of the directions, keep exploring. Do not synthesize early.

### 5. Synthesize Decision-Point Q&A

Turn each material decision into one elaboration question:

- `text`: the neutral decision question
- `category`: `functional`, `non_functional`, `business_context`, `technical_context`, `user_scenario`, or `scope`
- `options`: the directions that were seriously considered
- `selectedOptionId`: the option the user approved
- `customText`: a 1-3 sentence rationale capturing why that option won

### 6. Persist The Round

Create the round:

```
chorus_tool_execute({ toolName: "chorus_pm_start_elaboration", arguments: {
  ideaUuid: "<idea-uuid>",
  depth: "standard",
  questions: [
    { id: "q1", text: "...", category: "functional", options: [...] }
  ]
} })
```

Then answer it in one call:

```
chorus_tool_execute({ toolName: "chorus_answer_elaboration", arguments: {
  ideaUuid: "<idea-uuid>",
  answers: [
    { questionId: "q1", selectedOptionId: "a", customText: "Rationale..." }
  ]
} })
```

   Omit `roundUuid` when this is the only active round; Chorus auto-locates it.

### 7. Return Control

Stop here and return to `chorus-idea`.

`chorus-idea` decides what happens next:

- if the synthesized round is enough, it resolves elaboration with `chorus_tool_execute({ toolName: "chorus_pm_validate_elaboration", arguments: { ideaUuid } })`;
- if important gaps remain, it opens a follow-up round with `chorus_pm_start_elaboration`.

---

## Anti-Patterns

- **One huge summary blob** — do not compress the whole conversation into one long `customText`.
- **Transcript dump** — do not post or preserve the raw brainstorm as a comment.
- **File writing** — this skill does not create proposal, design, or task artifacts.
- **Premature validation** — never call `chorus_pm_validate_elaboration` from here.
- **Binary yes/no framing** — do not reduce every decision to a two-choice pseudo-question if real alternatives exist.

---

## Next

- Return to `chorus-idea` to resolve elaboration or open a follow-up round.
- For platform overview and shared tools, see `/chorus`.
