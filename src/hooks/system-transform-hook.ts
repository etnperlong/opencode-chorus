// Injects concise system guidance for Chorus file-writing workflows.
// This steers agents toward native file tools and the managed staging directory.

import {
  formatStagingDirSystemGuidance,
  PREFER_NATIVE_FILE_TOOLS_GUIDANCE,
} from "../util/staging-guidance"

type SystemTransformOutput = {
  system: string[]
}

export function createSystemTransformHook(options: { stagingDir?: string }) {
  return async (_input: {}, output: SystemTransformOutput): Promise<void> => {
    output.system.push(PREFER_NATIVE_FILE_TOOLS_GUIDANCE)
    if (options.stagingDir) output.system.push(formatStagingDirSystemGuidance(options.stagingDir))
  }
}
