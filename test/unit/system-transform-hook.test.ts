import { describe, expect, it } from "bun:test"
import { createSystemTransformHook } from "../../src/hooks/system-transform-hook"

describe("system transform hook", () => {
  it("always injects native file tool guidance", async () => {
    const hook = createSystemTransformHook({})
    const output = { system: ["existing"] }

    await hook({} as never, output as never)

    expect(output.system).toContain("existing")
    expect(output.system).toContain(
      "Prefer OpenCode's native `write` and `edit` tools when creating or updating local files. Avoid bash-based file writes such as `cat >`, `echo >`, shell heredocs, or `tee` unless no native file tool can perform the edit.",
    )
  })

  it("injects staging directory guidance when available", async () => {
    const hook = createSystemTransformHook({ stagingDir: "/chorus/staging" })
    const output = { system: [] as string[] }

    await hook({} as never, output as never)

    expect(output.system.some((line) => line.includes("/chorus/staging"))).toBe(true)
    expect(output.system.some((line) => line.includes("auto-allows write/edit permission requests"))).toBe(true)
  })
})
