import type { ChorusMcpClient } from "./mcp-client"
import { createAdminTools } from "./tool-groups/admin-tools"
import { createCommonTools } from "./tool-groups/common-tools"
import { createDevTools } from "./tool-groups/dev-tools"
import { createPmTools } from "./tool-groups/pm-tools"
import { createSessionTools } from "./tool-groups/session-tools"

export function createChorusTools(chorusClient: ChorusMcpClient) {
  return {
    ...createCommonTools(chorusClient),
    ...createDevTools(chorusClient),
    ...createPmTools(chorusClient),
    ...createAdminTools(chorusClient),
    ...createSessionTools(chorusClient),
  }
}
