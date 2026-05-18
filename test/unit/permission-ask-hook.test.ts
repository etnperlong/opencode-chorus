import { describe, expect, it } from "bun:test"
import { createPermissionAskHook } from "../../src/hooks/permission-ask-hook"

describe("permission ask hook", () => {
  it("auto-allows edit permissions for files inside the Chorus staging directory", async () => {
    const hook = createPermissionAskHook({ stagingDir: "/chorus/staging" })
    const output: { status: "ask" | "deny" | "allow" } = { status: "ask" }

    await hook(
      {
        type: "edit",
        pattern: "/chorus/staging/doc.md",
      },
      output,
    )

    expect(output.status).toBe("allow")
  })

  it("auto-allows write tool permissions for files inside the Chorus staging directory", async () => {
    const hook = createPermissionAskHook({ stagingDir: "/chorus/staging" })
    const output: { status: "ask" | "deny" | "allow" } = { status: "ask" }

    await hook(
      {
        type: "tool",
        metadata: {
          tool: "write",
          args: { filePath: "/chorus/staging/doc.md" },
        },
      },
      output,
    )

    expect(output.status).toBe("allow")
  })

  it("does not auto-allow writes outside the Chorus staging directory", async () => {
    const hook = createPermissionAskHook({ stagingDir: "/chorus/staging" })
    const output: { status: "ask" | "deny" | "allow" } = { status: "ask" }

    await hook(
      {
        type: "edit",
        pattern: "/workspace/docs/doc.md",
      },
      output,
    )

    expect(output.status).toBe("ask")
  })
})
