import { ChorusMcpClient, type ChorusMcpClientOptions } from "./mcp-client"

export function createChorusMcpClient(options: ChorusMcpClientOptions): ChorusMcpClient {
  return new ChorusMcpClient(options)
}
