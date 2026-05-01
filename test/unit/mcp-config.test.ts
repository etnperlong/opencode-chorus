import { describe, expect, it } from "bun:test"
import { createChorusMcpHeaders, createChorusRemoteMcpConfig, resolveChorusMcpUrl } from "../../src/chorus/mcp-config"

describe("resolveChorusMcpUrl", () => {
  it("appends api/mcp for root-hosted Chorus URLs", () => {
    expect(resolveChorusMcpUrl("https://chorus.example")).toBe("https://chorus.example/api/mcp")
  })

  it("normalizes trailing slash variants", () => {
    expect(resolveChorusMcpUrl("https://chorus.example/root/")).toBe("https://chorus.example/root/api/mcp")
  })

  it("preserves subpath-hosted Chorus URLs", () => {
    expect(resolveChorusMcpUrl("https://chorus.example/team/workspace")).toBe(
      "https://chorus.example/team/workspace/api/mcp",
    )
  })
})

describe("createChorusMcpHeaders", () => {
  it("creates a bearer authorization header", () => {
    expect(createChorusMcpHeaders("test-key")).toEqual({
      Authorization: "Bearer test-key",
    })
  })

  it("adds project scope headers when a Chorus tool call is scoped", () => {
    expect(createChorusMcpHeaders("test-key", { projectUuid: "project-1" })).toEqual({
      Authorization: "Bearer test-key",
      "X-Chorus-Project": "project-1",
    })
  })

  it("prefers project group scope over project scope", () => {
    expect(
      createChorusMcpHeaders("test-key", { projectUuid: "project-1", projectGroupUuid: "group-1" }),
    ).toEqual({
      Authorization: "Bearer test-key",
      "X-Chorus-Project-Group": "group-1",
    })
  })
})

describe("createChorusRemoteMcpConfig", () => {
  it("builds the native remote MCP config shape", () => {
    expect(createChorusRemoteMcpConfig("https://chorus.example/app", "test-key")).toEqual({
      type: "remote",
      url: "https://chorus.example/app/api/mcp",
      headers: {
        Authorization: "Bearer test-key",
      },
      oauth: false,
      enabled: true,
    })
  })
})
