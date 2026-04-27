import type { Plugin } from "@opencode-ai/plugin"
import { createPlugin } from "./src/index"

export const ChorusPlugin: Plugin = async (ctx, options) => createPlugin(ctx, options)

export default ChorusPlugin
