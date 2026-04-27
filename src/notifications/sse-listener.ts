export type SseNotificationEvent = { type: string; notificationUuid?: string }

export type ParsedSseNotificationChunk = {
  events: SseNotificationEvent[]
  buffer: string
}

export function parseSseNotificationChunk(buffer: string, chunk: string): ParsedSseNotificationChunk {
  let nextBuffer = (buffer + chunk).replace(/\r\n/g, "\n")
  const events: SseNotificationEvent[] = []
  let boundary = nextBuffer.indexOf("\n\n")

  while (boundary !== -1) {
    const raw = nextBuffer.slice(0, boundary)
    nextBuffer = nextBuffer.slice(boundary + 2)
    const data = raw
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")

    if (data) {
      const event = parseNotificationEvent(data)
      if (event) events.push(event)
    }

    boundary = nextBuffer.indexOf("\n\n")
  }

  return { events, buffer: nextBuffer }
}

export class ChorusSseListener {
  private abortController: AbortController | null = null

  constructor(
    private readonly chorusUrl: string,
    private readonly apiKey: string,
    private readonly onEvent: (event: SseNotificationEvent) => void,
  ) {}

  async connect(): Promise<void> {
    this.abortController = new AbortController()
    const response = await fetch(`${this.chorusUrl.replace(/\/$/, "")}/api/events/notifications`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "text/event-stream",
      },
      signal: this.abortController.signal,
    })

    if (!response.ok) throw new Error(`Chorus notification SSE request failed with status ${response.status}`)

    const reader = response.body?.getReader()
    if (!reader) throw new Error("Chorus notification SSE response body is missing")
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const parsed = parseSseNotificationChunk(buffer, decoder.decode(value, { stream: true }))
      buffer = parsed.buffer
      for (const event of parsed.events) this.onEvent(event)
    }
  }

  disconnect(): void {
    this.abortController?.abort()
  }
}

function parseNotificationEvent(data: string): SseNotificationEvent | null {
  try {
    const parsed = JSON.parse(data)
    return isSseNotificationEvent(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isSseNotificationEvent(value: unknown): value is SseNotificationEvent {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).type === "string"
  )
}
