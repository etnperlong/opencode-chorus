import { mock } from "bun:test"
import type { ChorusMcpToolDefinition } from "../../src/chorus/mcp-client"
import type { SseListenerStatus } from "../../src/notifications/sse-listener"

type PluginHookMockRuntime = {
  listTools(): Promise<ChorusMcpToolDefinition[]>
  callTool(name: string, args?: Record<string, unknown>): Promise<unknown>
  disconnectMcp(): Promise<void>
  getSseStatus(): SseListenerStatus
  connectSse(): Promise<void>
  disconnectSse(): void
}

let runtime: PluginHookMockRuntime = {
  async listTools() {
    throw new Error("Plugin hook mock runtime was not initialized")
  },
  async callTool() {
    throw new Error("Plugin hook mock runtime was not initialized")
  },
  async disconnectMcp() {},
  getSseStatus() {
    return "disconnected"
  },
  async connectSse() {},
  disconnectSse() {},
}

export function setPluginHookMockRuntime(nextRuntime: PluginHookMockRuntime): void {
  runtime = nextRuntime
}

export function restorePluginHookMocks(): void {
  mock.restore()
}

mock.module("../../src/chorus/mcp-client-factory", () => ({
  createChorusMcpClient: () => ({
    async listTools() {
      return runtime.listTools()
    },

    async callTool<T>(name: string, args: Record<string, unknown> = {}) {
      return runtime.callTool(name, args) as Promise<T>
    },

    async disconnect() {
      await runtime.disconnectMcp()
    },
  }),
}))

mock.module("../../src/notifications/sse-listener-factory", () => ({
  createChorusSseListener: () => ({
    get status() {
      return runtime.getSseStatus()
    },

    async connect() {
      await runtime.connectSse()
    },

    disconnect() {
      runtime.disconnectSse()
    },
  }),
}))
