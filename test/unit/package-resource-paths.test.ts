import { describe, expect, it } from "bun:test"
import { stat } from "node:fs/promises"
import { basename } from "node:path"
import { bundledSkillsDir, getBundledPromptUrl, readBundledPrompt } from "../../src/util/package-resource-paths"

describe("package resource paths", () => {
  it("resolves bundled skills and reviewer prompts from the package root", async () => {
    expect(basename(bundledSkillsDir)).toBe("skills")
    expect((await stat(bundledSkillsDir)).isDirectory()).toBe(true)

    const promptUrl = getBundledPromptUrl("proposal-reviewer.md")
    expect(basename(promptUrl.pathname)).toBe("proposal-reviewer.md")

    const prompt = await readBundledPrompt("proposal-reviewer.md")
    expect(prompt).toContain("VERDICT:")
  })
})
