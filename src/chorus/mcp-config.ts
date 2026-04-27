type ChorusRemoteMcpConfig = {
  type: "remote"
  url: string
  headers: Record<string, string>
  oauth: false
  enabled: true
}

function normalizeChorusBaseUrl(chorusUrl: string): URL {
  return new URL(chorusUrl.endsWith("/") ? chorusUrl : `${chorusUrl}/`)
}

export function resolveChorusMcpUrl(chorusUrl: string): string {
  return new URL("api/mcp", normalizeChorusBaseUrl(chorusUrl)).toString()
}

export function createChorusMcpHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
  }
}

export function createChorusRemoteMcpConfig(chorusUrl: string, apiKey: string): ChorusRemoteMcpConfig {
  return {
    type: "remote",
    url: resolveChorusMcpUrl(chorusUrl),
    headers: createChorusMcpHeaders(apiKey),
    oauth: false,
    enabled: true,
  }
}
