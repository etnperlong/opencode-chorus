import { describe, expect, it } from "bun:test"
import { CHORUS_SKILL_FIRST_GUIDANCE, createSystemTransformHook } from "../../src/hooks/system-transform-hook"

describe("system transform hook", () => {
  it("always injects native file tool guidance", async () => {
    const hook = createSystemTransformHook({ isOpenSpecAvailable: async () => false })
    const output = { system: ["existing"] }

    await hook({} as never, output as never)

    expect(output.system).toContain("existing")
    expect(output.system).toContain(
      "Prefer OpenCode's native `write` and `edit` tools when creating or updating local files. Avoid bash-based file writes such as `cat >`, `echo >`, shell heredocs, or `tee` unless no native file tool can perform the edit.",
    )
    expect(output.system).toContain(CHORUS_SKILL_FIRST_GUIDANCE)
  })

  it("injects staging directory guidance when available", async () => {
    const hook = createSystemTransformHook({ stagingDir: "/chorus/staging", isOpenSpecAvailable: async () => false })
    const output = { system: [] as string[] }

    await hook({} as never, output as never)

    expect(output.system.some((line) => line.includes("/chorus/staging"))).toBe(true)
    expect(output.system.some((line) => line.includes("auto-allows write/edit permission requests"))).toBe(true)
  })

  it("injects managed Chorus context from cached state without undefined metadata", async () => {
    const hook = createSystemTransformHook({
      projectUuids: ["project-1"],
      stateStore: {
        readOpenCodeState: async () => ({
          sessionContext: {
            source: "chorus_checkin",
            runtimeSessionId: "session-1",
            lastRefreshedAt: "2026-01-01T00:00:00.000Z",
            agent: { name: "OpenCode", permissions: { idea: ["read", "write"], task: ["read", "write"] } },
            owner: { name: "etnperlong", uuid: "user-1" },
            projects: [{ uuid: "project-1", name: "OpenCode-Chorus" }],
          },
        }),
        readSharedState: async () => ({ context: {} }),
      },
      isOpenSpecAvailable: async () => true,
    })
    const output = { system: [] as string[] }

    await hook({ sessionID: "session-1" } as never, output as never)

    const rendered = output.system.join("\n")
    expect(rendered).toContain("Chorus Context:")
    expect(rendered).toContain("Chorus project scope: managed")
    expect(rendered).toContain("Project: OpenCode-Chorus (project-1)")
    expect(rendered).toContain("Agent: OpenCode")
    expect(rendered).toContain("Owner: etnperlong (user-1)")
    expect(rendered).toContain("Permissions: idea:read,write")
    expect(rendered).toContain("OpenSpec: available")
    expect(rendered).not.toContain("undefined")
    expect(rendered).not.toContain("null")
  })

  it("falls back to unmanaged scope when no Chorus project can be determined", async () => {
    const hook = createSystemTransformHook({
      stateStore: {
        readOpenCodeState: async () => ({}),
        readSharedState: async () => ({ context: {} }),
      },
      isOpenSpecAvailable: async () => false,
    })
    const output = { system: [] as string[] }

    await hook({ sessionID: "session-1" } as never, output as never)

    const rendered = output.system.join("\n")
    expect(rendered).toContain("Chorus project scope: unmanaged")
    expect(rendered).toContain("do not assume projectUuid")
    expect(rendered).not.toContain("Project: undefined")
  })

  it("reports ambiguous scope for multiple cached session projects", async () => {
    const hook = createSystemTransformHook({
      stateStore: {
        readOpenCodeState: async () => ({
          sessionContext: {
            source: "chorus_checkin",
            runtimeSessionId: "session-1",
            lastRefreshedAt: "2026-01-01T00:00:00.000Z",
            projects: [
              { uuid: "project-1", name: "OpenCode-Chorus" },
              { uuid: "project-2", name: "CLIProxyAPI" },
            ],
          },
        }),
      },
      isOpenSpecAvailable: async () => false,
    })
    const output = { system: [] as string[] }

    await hook({ sessionID: "session-1" } as never, output as never)

    const rendered = output.system.join("\n")
    expect(rendered).toContain("Chorus project scope: ambiguous")
    expect(rendered).toContain("Multiple Chorus projects may apply here")
    expect(rendered).toContain("Candidate project count: 2")
  })

  it("omits owner line when owner metadata is missing and tolerates missing session IDs", async () => {
    const hook = createSystemTransformHook({
      projectUuids: ["project-1"],
      stateStore: {
        readOpenCodeState: async () => ({
          sessionContext: {
            source: "chorus_checkin",
            runtimeSessionId: "session-1",
            lastRefreshedAt: "2026-01-01T00:00:00.000Z",
            projects: [{ uuid: "project-1", name: "OpenCode-Chorus" }],
          },
        }),
      },
      isOpenSpecAvailable: async () => false,
    })
    const output = { system: [] as string[] }

    await hook({} as never, output as never)

    const rendered = output.system.join("\n")
    expect(rendered).toContain("Chorus project scope: managed")
    expect(rendered).toContain("Project UUID: project-1")
    expect(rendered).not.toContain("Owner:")
    expect(rendered).not.toContain("undefined")
  })

  it("swallows state read failures and still injects fallback guidance", async () => {
    const hook = createSystemTransformHook({
      stateStore: {
        readOpenCodeState: async () => {
          throw new Error("state unavailable")
        },
        readSharedState: async () => {
          throw new Error("shared unavailable")
        },
      },
      isOpenSpecAvailable: async () => false,
    })
    const output = { system: [] as string[] }

    await expect(hook({ sessionID: "session-1" } as never, output as never)).resolves.toBeUndefined()

    const rendered = output.system.join("\n")
    expect(rendered).toContain(CHORUS_SKILL_FIRST_GUIDANCE)
    expect(rendered).toContain("Chorus project scope: unmanaged")
  })
})
