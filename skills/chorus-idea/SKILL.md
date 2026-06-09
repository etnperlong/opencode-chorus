---
name: chorus-idea
description: Chorus ideation workflow for OpenCode. Use when claiming ideas, running elaboration rounds, clarifying requirements, and preparing proposal-ready context.
license: AGPL-3.0
compatibility: opencode
metadata:
  author: chorus
  version: "0.9.4"
  category: project-management
  mcp_server: lazy-chorus-bridge
  workflow: ideation
  role: idea:write
  audience: opencode-agents
  source: chorus-plugin
  keywords: idea,elaboration,requirements,questions,owner-confirmation,pm-workflow
  tools: chorus_claim_idea,chorus_pm_start_elaboration,chorus_answer_elaboration,chorus_pm_validate_elaboration
---


# Idea Skill

This skill covers the **Ideation** stage of the AI-DLC workflow: claiming Ideas, running structured elaboration rounds to clarify requirements, and preparing for Proposal creation.

## OpenCode Tool Access

In OpenCode plugin mode, Chorus uses the lazy bridge tools `chorus_tools`, `chorus_tool_get`, and `chorus_tool_execute`. Start with `chorus_tools`, inspect one tool with `chorus_tool_get({ toolName: "..." })`, then execute it with `chorus_tool_execute({ toolName: "...", arguments: { ... } })`.

---

## Overview

Ideas are the starting point of the AI-DLC pipeline. Humans, or agents with `task:admin`, create Ideas describing what they need. An agent with `idea:write` claims an Idea, runs elaboration to clarify requirements, and then moves on to `chorus-proposal` to create a Proposal with document and task drafts.

**Idea status lifecycle (3 stored states):**

```
open --> elaborating --> elaborated
```

All post-elaboration progress (planning, building, verifying, done) is **derived** from the state of linked Proposals and Tasks. No agent should set Idea status directly beyond elaboration -- all transitions are side-effects of claiming, releasing, or completing elaboration.

---

## Tools

**Idea Management:**

| Tool | Purpose |
|------|---------|
| `chorus_pm_create_idea` | Create a new idea in a project (on behalf of humans) |
| `chorus_claim_idea` | Claim an open idea (open -> elaborating) |
| `chorus_release_idea` | Release a claimed idea (elaborating -> open) |
| `chorus_move_idea` | Move an idea to a different project (also moves linked draft/pending proposals) |

**Requirements Elaboration:**

| Tool | Purpose |
|------|---------|
| `chorus_pm_start_elaboration` | Start any elaboration round: first round, follow-up, or appended-after-resolution |
| `chorus_pm_validate_elaboration` | Resolve an Idea's elaboration once all rounds are answered |
| `chorus_pm_skip_elaboration` | Skip elaboration for trivially clear Ideas |
| `chorus_answer_elaboration` | Submit answers for an elaboration round |
| `chorus_get_elaboration` | Get full elaboration state (rounds, questions, answers) |

**Shared tools** (checkin, query, comment, search, notifications): see `/chorus`

---

## Workflow

### Step 1: Check In

```
chorus_checkin()
```

Review your persona, current assignments, and pending work counts.

### Step 2: Find Work

```
chorus_get_available_ideas({ projectUuid: "<project-uuid>" })
```

Or check existing assignments:

```
chorus_get_my_assignments()
```

### Step 3: Claim an Idea

Claiming automatically transitions the Idea to `elaborating` status:

```
chorus_claim_idea({ ideaUuid: "<idea-uuid>" })
```

### Step 4: Gather Context

Before elaborating, understand the full picture:

1. **Read the idea in detail:**
   ```
   chorus_get_idea({ ideaUuid: "<idea-uuid>" })
   ```

2. **Read existing project documents** (for context, tech stack, conventions):
   ```
   chorus_get_documents({ projectUuid: "<project-uuid>" })
   chorus_get_document({ documentUuid: "<doc-uuid>" })
   ```

3. **Review past proposals** (to understand patterns and standards):
   ```
   chorus_get_proposals({ projectUuid: "<project-uuid>", status: "approved" })
   ```

4. **Check existing tasks** (to avoid duplication):
   ```
   chorus_list_tasks({ projectUuid: "<project-uuid>" })
   ```

5. **Read comments** on the idea for additional context:
   ```
   chorus_get_comments({ targetType: "idea", targetUuid: "<idea-uuid>" })
   ```

### Step 4.5: Brainstorm Mode (Optional Prelude)

If the idea is still fuzzy and you cannot yet write good structured elaboration questions, offer the user an explicit brainstorm prelude before Step 5.

Use the OpenCode `question` tool once:

```
question({
  questions: [
    {
      header: "Brainstorm",
      question: "Should we explore directions first, or go straight to structured elaboration?",
      options: [
        { label: "Already clear (Recommended)", description: "Skip brainstorming and write structured elaboration questions now" },
        { label: "Brainstorm first", description: "Explore options before committing to structured questions" }
      ]
    }
  ]
})
```

- If the user chooses **Already clear**, continue to Step 5.
- If the user chooses **Brainstorm first**, load `chorus-brainstorm` and follow it.

When `chorus-brainstorm` returns, you own the lifecycle decision:

- if the synthesized round already covers the open decisions, call `chorus_pm_validate_elaboration({ ideaUuid })` to resolve elaboration;
- if important gaps remain, call `chorus_pm_start_elaboration` again to open a structured follow-up round.

Either outcome ends the brainstorm prelude; skip directly to validation behavior rather than re-running the full Step 5 flow from scratch.

### Step 5: Elaborate on the Idea

**Every Idea should go through elaboration.** Skip only when requirements are completely unambiguous (e.g., bug fix with clear steps). Elaboration improves Proposal quality and reduces rejection cycles.

#### Simple Ideas (skip elaboration)

You may skip elaboration, but **you MUST ask the user for permission first** via OpenCode question tool before calling `chorus_pm_skip_elaboration`. Never skip on your own judgment alone.

```
chorus_pm_skip_elaboration({
  ideaUuid: "<idea-uuid>",
  reason: "Bug fix with clear reproduction steps"
})
```

#### Standard/Complex Ideas (run elaboration)

1. **Determine depth** based on idea complexity:
   - `"minimal"` — 2-4 questions (small features, minor enhancements)
   - `"standard"` — 5-10 questions (typical new features)
   - `"comprehensive"` — 10-15 questions (large features, architectural changes)

2. **Create elaboration questions:**

   `chorus_pm_start_elaboration` creates any round in the lifecycle: the first round, a follow-up round derived from previous answers, or an appended round after an already-resolved Idea when new information appears. The current tool call takes only `ideaUuid`, `depth`, and `questions`; do not pass a separate `isAppended` argument. Treat appended-after-resolution as a lifecycle semantic reflected by Chorus state/metadata, not as an extra input field.

   > **Note:** Do NOT include an "Other" option in your questions. The UI automatically adds a free-text "Other" option to every question.

   ```
   chorus_pm_start_elaboration({
      ideaUuid: "<idea-uuid>",
      depth: "standard",
      questions: [
        {
          id: "q1",
          text: "What permission level should this feature require?",
          category: "functional",
          options: [
            { id: "a", label: "All users" },
            { id: "b", label: "Admin only" },
            { id: "c", label: "Role-based (configurable)" }
          ]
        }
      ]
   })
   ```

3. **Present questions to the user — MUST use `OpenCode question tool`.** Do NOT display questions as plain text. Map each elaboration question to an OpenCode question tool call (max 4 questions per call; batch if needed):

   ```
   question({
     questions: [
       {
         question: "Which new locales should be prioritized for V1?",
         header: "Scope",
         options: [
           { label: "Japanese only", description: "Single locale for initial release" },
           { label: "Japanese + Korean", description: "Two East Asian locales" }
         ],
         multiSelect: false
       }
     ]
   })
   ```

   After the user answers, map their selections back to option IDs and call `chorus_answer_elaboration`. If the user selected "Other", set `selectedOptionId: null` and `customText` to their input. `roundUuid` is optional when there is exactly one active round; omit it in that case and Chorus auto-locates the active round. Include `roundUuid` only when you need to disambiguate.

4. **Submit answers:**
   ```
   chorus_answer_elaboration({
      ideaUuid: "<idea-uuid>",
      answers: [
        { questionId: "q1", selectedOptionId: "c", customText: null },
        { questionId: "q2", selectedOptionId: null, customText: "Custom hybrid approach" }
      ]
   })
   ```

   Answer format:
   - **Select an option**: `selectedOptionId: "a", customText: null`
   - **Select an option + add a note**: `selectedOptionId: "a", customText: "additional context"`
   - **Choose "Other" (free text)**: `selectedOptionId: null, customText: "your answer"` — customText is required when no option is selected

5. **Review answers and confirm with the owner (@mention flow):**

   After answers are submitted, **@mention the answerer** (typically the agent's owner) with a summary of your understanding. This prevents misinterpretation before you validate.

   a. **Get owner info** from checkin response (`agent.owner`) or search:
      ```
      chorus_search_mentionables({ query: "owner-name" })
      ```

   b. **Post a summary comment** on the idea:
      ```
      chorus_add_comment({
        targetType: "idea",
        targetUuid: "<idea-uuid>",
        content: "@[Owner Name](user:owner-uuid) I've reviewed the elaboration answers. Here's my understanding:\n\n- Key requirement 1: ...\n- Key requirement 2: ...\n\nDoes this match your intent?"
      })
      ```

   c. **Wait for confirmation** via comments.

   d. **Based on the response:**
      - **Confirmed** — Proceed to validate the Idea
      - **Additions/corrections** — Incorporate feedback, then call `chorus_pm_start_elaboration` again for a follow-up round if structured answers are needed
      - **Unclear** — Ask clarifying questions via another comment

6. **Validate the elaboration:**

   Validate only after all active rounds are answered, no gaps remain, and the owner has confirmed your understanding. This is an `idea:admin` action, so ask for human confirmation before calling it unless you are in explicit YOLO mode.

   ```
   chorus_pm_validate_elaboration({
      ideaUuid: "<idea-uuid>"
   })
   ```

   If issues are found (contradictions, ambiguities, incomplete answers), do not validate. Create another elaboration round with `chorus_pm_start_elaboration`, ask the user, answer it, and then re-check whether validation is now safe:

   ```
   chorus_pm_start_elaboration({
     ideaUuid: "<idea-uuid>",
     depth: "minimal",
     questions: [
       { id: "fq1", text: "Which specific permissions are required?", category: "functional", options: [...] }
     ]
   })
   ```

   Loop explicitly: answers that derive new questions go back to `chorus_pm_start_elaboration`; only call `chorus_pm_validate_elaboration({ ideaUuid })` when all questions are resolved.

7. **Check elaboration status** at any time:
   ```
   chorus_get_elaboration({ ideaUuid: "<idea-uuid>" })
   ```

**Elaboration as audit trail:** Even if the user discusses requirements with you outside the formal elaboration flow, record key decisions as elaboration rounds so they are persisted and visible to the team.

**Legacy round states:** `validated` and `needs_followup` may appear in historical elaboration data only. New v0.9.4 flow resolves at the Idea level and creates follow-ups by starting another elaboration round.

**Question categories:** `functional`, `non_functional`, `business_context`, `technical_context`, `user_scenario`, `scope`

**Follow-up issue types:** Use `contradiction`, `ambiguity`, or `incomplete` to classify gaps before creating another round.

---

## Tips

- When combining multiple ideas, explain how they relate in the proposal description
- Elaboration improves Proposal quality — don't skip it unless the requirements are trivially clear
- Use `OpenCode question tool` for all interactive questions — never plain text
- Record decisions made in conversation as elaboration rounds for auditability
- Always @mention the owner to confirm understanding before validating

---

## Next

- Once elaboration is resolved, use `chorus-proposal` to create a Proposal with document and task drafts
- For platform overview and shared tools, see `/chorus`
