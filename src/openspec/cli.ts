import { spawn } from "node:child_process"

export type OpenSpecCliOptions = {
  command?: string
  args?: string[]
  timeoutMs?: number
}

export async function isOpenSpecCliAvailable(options: OpenSpecCliOptions = {}): Promise<boolean> {
  const command = options.command ?? "openspec"
  const args = options.args ?? ["--version"]
  const timeoutMs = options.timeoutMs ?? 2_000

  return new Promise((resolve) => {
    let settled = false
    const child = spawn(command, args, { stdio: "ignore" })
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      resolve(false)
    }, timeoutMs)

    child.once("error", (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(!isMissingCommandError(error))
    })

    child.once("close", () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(true)
    })
  })
}

function isMissingCommandError(error: NodeJS.ErrnoException): boolean {
  return error.code === "ENOENT"
}
