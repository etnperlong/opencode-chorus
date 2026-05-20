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

  it("reconnects after a non-ok SSE response", async () => {
    const encoder = new TextEncoder()
    let fetchCalls = 0
    const statuses: string[] = []

    globalThis.fetch = (async () => {
      fetchCalls += 1
      if (fetchCalls === 1) return new Response("nope", { status: 503 })
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(': heartbeat\n\n'))
            setTimeout(() => controller.close(), 10)
          },
        }),
        { status: 200 },
      )
    }) as unknown as typeof fetch

    const listener = new ChorusSseListener("http://chorus.test", "key", () => {}, {
      initialReconnectDelayMs: 1,
      maxReconnectDelayMs: 1,
      onStatusChange: (status) => {
        statuses.push(status)
      },
    })

    const connectPromise = listener.connect()
    await Bun.sleep(20)
    listener.disconnect()
    await connectPromise

    expect(fetchCalls).toBeGreaterThanOrEqual(2)
    expect(statuses).toContain("reconnecting")
    expect(statuses).toContain("connected")
  })

  it("calls onReconnect after the stream reconnects", async () => {
    let reconnectCalls = 0
    let fetchCalls = 0

    globalThis.fetch = (async () => {
      fetchCalls += 1
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.close()
          },
        }),
        { status: 200 },
      )
    }) as unknown as typeof fetch

    const listener = new ChorusSseListener("http://chorus.test", "key", () => {}, {
      initialReconnectDelayMs: 1,
      maxReconnectDelayMs: 1,
      onReconnect: async () => {
        reconnectCalls += 1
      },
    })

    const connectPromise = listener.connect()
    await Bun.sleep(20)
    listener.disconnect()
    await connectPromise

    expect(fetchCalls).toBeGreaterThanOrEqual(2)
    expect(reconnectCalls).toBeGreaterThanOrEqual(1)
  })

  it("disconnect cancels reconnect wait so the listener can stop promptly", async () => {
    globalThis.fetch = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch

    const listener = new ChorusSseListener("http://chorus.test", "key", () => {}, {
      initialReconnectDelayMs: 1_000,
      maxReconnectDelayMs: 1_000,
    })

    const startedAt = Date.now()
    const connectPromise = listener.connect()
    await Bun.sleep(20)
    listener.disconnect()
    await connectPromise

    expect(Date.now() - startedAt).toBeLessThan(250)
  })
})
