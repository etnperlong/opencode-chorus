// Shared guidance for Chorus staging files.
// Keeps the session summary and injected system instructions aligned.

export const PREFER_NATIVE_FILE_TOOLS_GUIDANCE =
  "Prefer OpenCode's native `write` and `edit` tools when creating or updating local files. Avoid bash-based file writes such as `cat >`, `echo >`, shell heredocs, or `tee` unless no native file tool can perform the edit."

export function formatStagingDirGuidance(stagingDir: string): string {
  return (
    `Chorus document staging directory: ${stagingDir}\n` +
    `Write Chorus document bodies to files in this directory and pass the absolute path via \`contentPath\`. ` +
    `Prefer OpenCode's native \`write\` and \`edit\` tools for these files instead of bash-based file writes. ` +
    `This directory is outside the workspace to keep project files clean. Files here are deleted when the session ends. ` +
    `The plugin auto-allows write/edit permission requests targeting this directory.`
  )
}

export function formatStagingDirSystemGuidance(stagingDir: string): string {
  return (
    `For non-OpenSpec Chorus document uploads, create or update local files in the Chorus staging directory (${stagingDir}) ` +
    `with OpenCode's native \`write\` or \`edit\` tools, then pass the absolute path via \`contentPath\`. ` +
    `The plugin auto-allows write/edit permission requests targeting this directory.`
  )
}
