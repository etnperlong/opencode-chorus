import { describe, expect, it } from "bun:test"
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { ChorusMcpClient, isRetryableMcpSessionError, parseToolResult } from "../../src/chorus/mcp-client"
import { PACKAGE_VERSION } from "../../src/package-info"

describe("parseToolResult", () => {
  it("returns parsed JSON from the first text block", () => {
    const result = parseToolResult([
      { type: "text", text: '{"ok":true}' },
    ])

    expect(result).toEqual({ ok: true })
  })

  it("returns null when the first text block is empty", () => {
    const result = parseToolResult([
      { type: "text", text: "" },
    ])

    expect(result).toBeNull()
  })
})

describe("isRetryableMcpSessionError", () => {
  it("does not retry arbitrary errors that mention 404", () => {
    const error = new Error("Chorus MCP tool error: task 404 not found")

    expect(isRetryableMcpSessionError(error)).toBe(false)
  })

  it("retries streamable HTTP 404 errors", () => {
    const error = new StreamableHTTPError(404, "session not found")

    expect(isRetryableMcpSessionError(error)).toBe(true)
  })
})

describe("ChorusMcpClient", () => {
  it("uses the package version for MCP clientInfo", async () => {
    const packageJson = await Bun.file(new URL("../../package.json", import.meta.url)).json() as { version: string }
    const client = new ChorusMcpClient({ chorusUrl: "https://chorus.example", apiKey: "test" })
    const { client: mcpClient, transport } = client["createClientAndTransport"]()

    expect(PACKAGE_VERSION).toBe(packageJson.version)
    expect(PACKAGE_VERSION).not.toBe("0.1.0")
    expect((mcpClient as unknown as { _clientInfo: { version: string } })._clientInfo.version).toBe(packageJson.version)

    await transport.close().catch(() => {})
  })

  it("lists tools across paginated MCP responses", async () => {
    const client = new ChorusMcpClient({ chorusUrl: "https://chorus.example", apiKey: "test" })
    client["statusValue"] = "connected"
    client["client"] = {
      listTools: async ({ cursor }: { cursor?: string } = {}) => {
        if (!cursor) {
          return {
            tools: [
              { name: "chorus_checkin", description: "Check in", inputSchema: { type: "object" } },
            ],
            nextCursor: "page-2",
          }
        }
        return {
          tools: [
            { name: "chorus_get_task", description: "Get task", inputSchema: { type: "object" } },
          ],
        }
      },
    } as never

    const tools = await client.listTools()

    expect(tools.map((tool) => tool.name)).toEqual(["chorus_checkin", "chorus_get_task"])
  })

  it("clears stale in-flight connect promises on disconnect", async () => {
    const client = new ChorusMcpClient({ chorusUrl: "https://chorus.example", apiKey: "test" })
    client["connectPromise"] = Promise.resolve()

    await client.disconnect()

    expect(client["connectPromise"]).toBeNull()
  })

  it("clears client references when close rejects", async () => {
    const client = new ChorusMcpClient({ chorusUrl: "https://chorus.example", apiKey: "test" })
    client["client"] = { close: async () => { throw new Error("close failed") } } as never
    client["transport"] = { close: async () => {} } as never
    client["statusValue"] = "connected"

    await expect(client.disconnect()).rejects.toThrow("close failed")

    expect(client.status).toBe("disconnected")
    expect(client["client"]).toBeNull()
    expect(client["transport"]).toBeNull()
  })
})
