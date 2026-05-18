import { describe, expect, it } from "bun:test"
import { stat } from "node:fs/promises"
import { basename, join } from "node:path"
import { bundledSkillsDir, getBundledPromptUrl, readBundledPrompt } from "../../src/util/package-resource-paths"

describe("package resource paths", () => {
  it("resolves bundled skills and prompts from the package root", async () => {
    expect(basename(bundledSkillsDir)).toBe("skills")
    expect((await stat(bundledSkillsDir)).isDirectory()).toBe(true)
    expect((await stat(join(bundledSkillsDir, "chorus-openspec", "SKILL.md"))).isFile()).toBe(true)

    const promptUrl = getBundledPromptUrl("chorus-agent.md")
    expect(basename(promptUrl.pathname)).toBe("chorus-agent.md")

    const prompt = await readBundledPrompt("chorus-agent.md")
    expect(prompt).toContain("chorus_tools")
    expect(prompt).toContain("chorus_tool_get")
    expect(prompt).toContain("chorus_tool_execute")
  })

  it("keeps reviewer prompt comment contracts explicit", async () => {
    for (const promptName of ["proposal-reviewer.md", "task-reviewer.md"]) {
      const prompt = await readBundledPrompt(promptName)

      expect(prompt).toContain("exactly one Chorus review comment")
      expect(prompt).toContain("Review-Job-ID: <sessionId>")
      expect(prompt).toContain("VERDICT: PASS")
      expect(prompt).toContain("VERDICT: PASS WITH NOTES")
      expect(prompt).toContain("VERDICT: FAIL")
      expect(prompt).toContain("Do not use any other verdict text")
    }
  })
})
