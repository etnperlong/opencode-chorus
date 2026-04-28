import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

export const bundledSkillsDir = fileURLToPath(new URL("../../skills/", import.meta.url))

export function getBundledPromptUrl(name: string): URL {
  return new URL(`../../prompts/${name}`, import.meta.url)
}

export function readBundledPrompt(name: string): Promise<string> {
  return readFile(getBundledPromptUrl(name), "utf8")
}
