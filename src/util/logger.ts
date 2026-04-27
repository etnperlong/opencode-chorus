import type { PluginInput } from "@opencode-ai/plugin"

type LogLevel = "debug" | "info" | "warn" | "error"

export type Logger = {
  debug(message: string, extra?: Record<string, unknown>): Promise<void>
  info(message: string, extra?: Record<string, unknown>): Promise<void>
  warn(message: string, extra?: Record<string, unknown>): Promise<void>
  error(message: string, extra?: Record<string, unknown>): Promise<void>
}

export function createLogger(client: PluginInput["client"]): Logger {
  const write = async (level: LogLevel, message: string, extra?: Record<string, unknown>) => {
    await client.app.log({ body: { service: "opencode-chorus", level, message, extra } })
  }

  return {
    debug: (message, extra) => write("debug", message, extra),
    info: (message, extra) => write("info", message, extra),
    warn: (message, extra) => write("warn", message, extra),
    error: (message, extra) => write("error", message, extra),
  }
}
