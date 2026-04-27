import { afterEach, describe, expect, it } from "bun:test"
import { ChorusSseListener, parseSseNotificationChunk } from "../../src/notifications/sse-listener"

describe("parseSseNotificationChunk", () => {
  it("parses CRLF-delimited notification events", () => {
    const result = parseSseNotificationChunk(
      "",
      'data: {"type":"new_notification","notificationUuid":"n-1"}\r\n\r\n',
    )

    expect(result.events).toEqual([{ type: "new_notification", notificationUuid: "n-1" }])
    expect(result.buffer).toBe("")
  })

  it("concatenates multiple data lines for one event", () => {
    const result = parseSseNotificationChunk(
      "",
      'data: {"type":"new_notification",\ndata: "notificationUuid":"n-2"}\n\n',
    )

    expect(result.events).toEqual([{ type: "new_notification", notificationUuid: "n-2" }])
  })

  it("skips malformed event data without dropping later events", () => {
    const result = parseSseNotificationChunk(
      "",
      'data: not-json\n\ndata: {"type":"new_notification","notificationUuid":"n-3"}\n\n',
    )

    expect(result.events).toEqual([{ type: "new_notification", notificationUuid: "n-3" }])
  })
})

describe("ChorusSseListener", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("throws when the SSE endpoint responds with an error", async () => {
    globalThis.fetch = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch

    const listener = new ChorusSseListener("http://chorus.test", "key", () => {})

    await expect(listener.connect()).rejects.toThrow("503")
  })

  it("throws when the SSE endpoint has no response body", async () => {
    globalThis.fetch = (async () => ({ ok: true, status: 204, body: null }) as Response) as unknown as typeof fetch

    const listener = new ChorusSseListener("http://chorus.test", "key", () => {})

    await expect(listener.connect()).rejects.toThrow("body")
  })
})
