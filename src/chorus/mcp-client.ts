import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { createChorusMcpHeaders, resolveChorusMcpUrl } from "./mcp-config"
import type { ChorusToolTextContent, McpClientStatus } from "./types"

type ChorusMcpClientOptions = {
  chorusUrl: string
  apiKey: string
}

type McpToolResult = Awaited<ReturnType<Client["callTool"]>>

export function parseToolResult(content: ChorusToolTextContent[]): unknown {
  const text = content.find((item) => item.type === "text" && item.text !== undefined)?.text
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export function isRetryableMcpSessionError(error: unknown): boolean {
  return error instanceof StreamableHTTPError && error.code === 404
}

export class ChorusMcpClient {
  private client: Client | null = null
  private transport: StreamableHTTPClientTransport | null = null
  private connectPromise: Promise<void> | null = null
  private connectionGeneration = 0
  private statusValue: McpClientStatus = "disconnected"

  constructor(private readonly options: ChorusMcpClientOptions) {}

  get status(): McpClientStatus {
    return this.statusValue
  }

  async connect(): Promise<void> {
    if (this.statusValue === "connected") return
    if (this.connectPromise) return this.connectPromise

    const promise = this.openConnection(this.connectionGeneration)
    this.connectPromise = promise
    try {
      await promise
    } finally {
      if (this.connectPromise === promise) this.connectPromise = null
    }
  }

  async disconnect(): Promise<void> {
    this.connectionGeneration++
    this.connectPromise = null
    const client = this.client
    const transport = this.transport

    try {
      if (client) {
        await client.close()
      } else {
        await transport?.close()
      }
    } catch (error) {
      await transport?.close().catch(() => {})
      throw error
    } finally {
      this.statusValue = "disconnected"
      this.client = null
      this.transport = null
    }
  }

  async callTool<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    try {
      return await this.callConnectedTool<T>(name, args)
    } catch (error) {
      if (!isRetryableMcpSessionError(error)) throw error

      this.connectionGeneration++
      this.statusValue = "reconnecting"
      await this.client?.close()
      this.client = null
      this.transport = null
      return this.callConnectedTool<T>(name, args)
    }
  }

  private async openConnection(generation: number): Promise<void> {
    this.statusValue = this.statusValue === "reconnecting" ? "reconnecting" : "connecting"

    const client = new Client({ name: "opencode-chorus", version: "0.1.0" })
    const transport = new StreamableHTTPClientTransport(new URL(resolveChorusMcpUrl(this.options.chorusUrl)), {
      requestInit: {
        headers: createChorusMcpHeaders(this.options.apiKey),
      },
    })

    try {
      await client.connect(transport)
      if (generation !== this.connectionGeneration) {
        await client.close().catch(() => transport.close())
        return
      }

      this.client = client
      this.transport = transport
      this.statusValue = "connected"
    } catch (error) {
      if (generation === this.connectionGeneration) this.statusValue = "disconnected"
      await transport.close().catch(() => {})
      throw error
    }
  }

  private async callConnectedTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    await this.connect()
    if (!this.client) throw new Error("Chorus MCP client is not connected")

    const result = await this.client.callTool({ name, arguments: args })
    if ("isError" in result && result.isError) {
      throw new Error(this.formatToolError(result))
    }

    if ("content" in result) return parseToolResult(result.content as ChorusToolTextContent[]) as T
    return result.toolResult as T
  }

  private formatToolError(result: McpToolResult): string {
    if ("content" in result) {
      const parsed = parseToolResult(result.content as ChorusToolTextContent[])
      return typeof parsed === "string" ? parsed : JSON.stringify(parsed)
    }

    return JSON.stringify(result.toolResult)
  }
}
