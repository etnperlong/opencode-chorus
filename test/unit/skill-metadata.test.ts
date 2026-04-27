import { describe, expect, it } from "bun:test"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const skillsDir = fileURLToPath(new URL("../../skills/", import.meta.url))

const expectedSkills = [
  "chorus",
  "chorus-develop",
  "chorus-idea",
  "chorus-proposal",
  "chorus-quick-dev",
  "chorus-review",
  "chorus-yolo",
] as const

const expectedMetadata: Record<
  (typeof expectedSkills)[number],
  { workflow: string; role: string; keywords: string; tools: string; sentinels: string[] }
> = {
  chorus: {
    workflow: "overview",
    role: "all",
    keywords: "chorus,ai-dlc,mcp,project,notifications,setup,search,mentions",
    tools: "chorus_checkin,chorus_get_notifications,chorus_search,chorus_search_mentionables",
    sentinels: ["## Common Tools", "## Skill Routing", "AI-DLC"],
  },
  "chorus-develop": {
    workflow: "development",
    role: "developer-agent",
    keywords: "task,implementation,self-check,verification,subagents,work-report",
    tools:
      "chorus_claim_task,chorus_update_task,chorus_report_work,chorus_report_criteria_self_check,chorus_submit_for_verify",
    sentinels: ["## Tools", "## Workflow", "VERDICT:", "OpenCode subagents"],
  },
  "chorus-idea": {
    workflow: "ideation",
    role: "pm-agent",
    keywords: "idea,elaboration,requirements,questions,owner-confirmation,pm-workflow",
    tools:
      "chorus_claim_idea,chorus_pm_start_elaboration,chorus_answer_elaboration,chorus_pm_validate_elaboration",
    sentinels: ["## Tools", "## Workflow", "elaboration", "question"],
  },
  "chorus-proposal": {
    workflow: "planning",
    role: "pm-agent",
    keywords: "proposal,prd,tech-design,task-drafts,dependency-dag,acceptance-criteria",
    tools:
      "chorus_pm_create_proposal,chorus_pm_add_document_draft,chorus_pm_add_task_draft,chorus_pm_submit_proposal",
    sentinels: ["## Tools", "## Workflow", "dependency", "Task Writing Guidelines"],
  },
  "chorus-quick-dev": {
    workflow: "quick-development",
    role: "admin-or-developer-agent",
    keywords: "quick-task,hotfix,acceptance-criteria,self-verify,small-change",
    tools:
      "chorus_create_tasks,chorus_claim_task,chorus_report_work,chorus_submit_for_verify,chorus_admin_verify_task",
    sentinels: ["## Workflow", "acceptanceCriteriaItems", "self-verification"],
  },
  "chorus-review": {
    workflow: "review",
    role: "admin-agent",
    keywords: "proposal-review,task-verification,verdict,governance,acceptance-criteria",
    tools:
      "chorus_admin_approve_proposal,chorus_pm_reject_proposal,chorus_mark_acceptance_criteria,chorus_admin_verify_task,chorus_admin_reopen_task",
    sentinels: ["## Tools", "## Review Strategy", "VERDICT:", "Governance Principles"],
  },
  "chorus-yolo": {
    workflow: "full-auto",
    role: "all-roles",
    keywords: "full-auto,ai-dlc,proposal-reviewer,task-reviewer,waves,autonomous",
    tools:
      "chorus_admin_create_project,chorus_pm_create_idea,chorus_pm_create_proposal,chorus_pm_submit_proposal,chorus_admin_approve_proposal,chorus_submit_for_verify,chorus_admin_verify_task",
    sentinels: ["Full-auto AI-DLC", "## Workflow", "Phase 1: Planning", "Wave-based"],
  },
}

function parseFrontmatter(source: string): Record<string, string | Record<string, string>> {
  const match = source.match(/^---\n([\s\S]*?)\n---/)
  expect(match).not.toBeNull()
  if (!match?.[1]) {
    throw new Error("Expected SKILL.md frontmatter block")
  }

  const fields: Record<string, string | Record<string, string>> = {}
  let currentMap: string | undefined

  for (const line of match[1].split("\n")) {
    const nested = line.match(/^  ([^:]+):\s*(.*)$/)
    if (nested && currentMap !== undefined) {
      const [, nestedKey, nestedValue] = nested
      if (nestedKey === undefined || nestedValue === undefined) {
        throw new Error(`Invalid metadata line: ${line}`)
      }

      const map = fields[currentMap]
      if (typeof map !== "object") {
        throw new Error(`Expected ${currentMap} to be a metadata map`)
      }
      map[nestedKey.trim()] = nestedValue.trim().replace(/^"(.*)"$/, "$1")
      continue
    }

    const separator = line.indexOf(":")
    if (separator === -1) continue

    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()

    if (value === "") {
      fields[key] = {}
      currentMap = key
    } else {
      fields[key] = value.replace(/^"(.*)"$/, "$1")
      currentMap = undefined
    }
  }

  return fields
}

describe("bundled skill metadata", () => {
  it("ships valid OpenCode frontmatter and complete Chorus workflow skills", async () => {
    const entries = await readdir(skillsDir, { withFileTypes: true })
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()

    expect(directories).toEqual([...expectedSkills].sort())

    for (const directory of expectedSkills) {
      const source = await readFile(join(skillsDir, directory, "SKILL.md"), "utf8")
      const frontmatter = parseFrontmatter(source)
      const metadata = frontmatter.metadata
      const expected = expectedMetadata[directory]

      expect(frontmatter.name).toBe(directory)
      expect(typeof frontmatter.description).toBe("string")
      expect((frontmatter.description as string).length).toBeGreaterThan(0)
      expect((frontmatter.description as string).length).toBeLessThanOrEqual(1024)
      expect(frontmatter.license).toBe("AGPL-3.0")
      expect(frontmatter.compatibility).toBe("opencode")
      expect(metadata).toEqual({
        author: "chorus",
        version: "0.7.5",
        category: "project-management",
        mcp_server: "chorus",
        workflow: expected.workflow,
        role: expected.role,
        audience: "opencode-agents",
        source: "chorus-plugin",
        keywords: expected.keywords,
        tools: expected.tools,
      })

      for (const sentinel of expected.sentinels) {
        expect(source).toContain(sentinel)
      }
      expect(source).not.toContain("Claude Code")
      expect(source).not.toContain("Claude Plugin")
      expect(source).not.toContain("Claude Code Agent Teams")
      expect(source).not.toContain(".mcp.json")
      expect(source).not.toContain(".claude")
      expect(source).not.toContain("~/.claude")
      expect(source).not.toMatch(/\/(idea|proposal|develop|quick-dev|review|yolo)\b/)
    }

    const chorusSource = await readFile(join(skillsDir, "chorus", "SKILL.md"), "utf8")
    expect(chorusSource).toContain('"$schema": "https://opencode.ai/config.json"')
    expect(chorusSource).toContain('"mcp"')
    expect(chorusSource).toContain('"chorus"')
    expect(chorusSource).toContain("chorus-idea")
    expect(chorusSource).toContain("chorus-yolo")
  })
})
