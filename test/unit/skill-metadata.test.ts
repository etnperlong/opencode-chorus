import { describe, expect, it } from "bun:test"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const skillsDir = fileURLToPath(new URL("../../skills/", import.meta.url))

function parseFrontmatter(source: string): Record<string, string> {
  const match = source.match(/^---\n([\s\S]*?)\n---/)
  expect(match).not.toBeNull()
  if (!match?.[1]) {
    throw new Error("Expected SKILL.md frontmatter block")
  }

  const fields: Record<string, string> = {}
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":")
    if (separator === -1) continue

    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    fields[key] = value
  }

  return fields
}

describe("bundled skill metadata", () => {
  it("ships valid OpenCode frontmatter for each bundled skill", async () => {
    const entries = await readdir(skillsDir, { withFileTypes: true })
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()

    expect(directories).toEqual(["chorus", "develop", "idea", "proposal", "quick-dev", "review"])

    for (const directory of directories) {
      const source = await readFile(join(skillsDir, directory, "SKILL.md"), "utf8")
      const frontmatter = parseFrontmatter(source)
      const description = frontmatter.description

      expect(frontmatter.name).toBe(directory)
      expect(typeof description).toBe("string")
      if (description === undefined) {
        throw new Error(`Expected ${directory} to define a description`)
      }

      expect(description.length).toBeGreaterThan(0)
    }
  })
})
