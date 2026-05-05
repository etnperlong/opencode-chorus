import type { ChorusMcpClient } from "../chorus/mcp-client"
import type { ChorusToolScope } from "../chorus/tool-scope"
import type { StateStore } from "../state/state-store"
import type { ReviewRecord } from "../state/state-types"
import { parseVerdict, type ReviewVerdict } from "./review-parser"
import { persistReviewTimeout, persistReviewVerdict } from "./review-sync"

const MIN_REVIEWER_STATUS_TIMEOUT_MS = 500

export type ReviewerWaitResult =
  | { status: "completed"; verdict: ReviewVerdict; comment?: string }
  | { status: "running"; message: string }
  | { status: "timeout"; message?: string }
  | { status: "escalated"; message?: string }
  | { status: "interrupted"; message: string }

type ReviewerWaitOptions = {
  client: Pick<ChorusMcpClient, "callTool">
  reviewClient?: {
    session?: {
      status?: (args: Record<string, unknown>) => Promise<unknown>
    }
  }
  stateStore: StateStore
  targetKey: string
  targetType: "proposal" | "task"
  targetUuid: string
  directory?: string
  timeoutMs: number
  pollIntervalMs: number
  reviewJobId?: string
  scope?: ChorusToolScope
}

export async function waitForReviewerVerdict(options: ReviewerWaitOptions): Promise<ReviewerWaitResult> {
  let deadline = Date.now() + options.timeoutMs
  let extendedForActiveReviewer = false

  while (true) {
    const state = await options.stateStore.readOpenCodeState()
    const persistedVerdict = readStateVerdict(state.reviews[options.targetKey])
    if (persistedVerdict) return { status: "completed", ...persistedVerdict }

    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      const reviewerStatus = await readReviewerSessionStatus(options)
      if (isReviewerSessionActive(reviewerStatus)) {
        if (!extendedForActiveReviewer) {
          extendedForActiveReviewer = true
          deadline = Date.now() + options.timeoutMs
          continue
        }
        return {
          status: "running",
          message: `Reviewer session ${options.reviewJobId ?? "unavailable"} is still ${formatReviewerSessionState(reviewerStatus)} after the wait window.`,
        }
      }

      return timeoutResult(options)
    }

    const result = await callToolWithTimeout(options.client, remainingMs, "chorus_get_comments", {
      targetType: options.targetType,
      targetUuid: options.targetUuid,
    }, options.scope)
    if (result.status === "timeout") continue

    for (const content of extractCommentContents(result.value)) {
      if (options.reviewJobId && !hasReviewJobMarker(content, options.reviewJobId)) continue
      const verdict = tryParseVerdict(content)
      if (!verdict) continue

      const persisted = await persistReviewVerdict(
        options.stateStore,
        options.targetKey,
        verdict,
        {
          ...(options.reviewJobId ? { expectedReviewJobId: options.reviewJobId } : {}),
          reviewerComment: content,
        },
      )
      if (!persisted) continue
      return { status: "completed", verdict, comment: content }
    }

    if (Date.now() >= deadline) continue
    await sleep(Math.min(Math.max(options.pollIntervalMs, 0), Math.max(deadline - Date.now(), 0)))
  }
}

async function timeoutResult(options: ReviewerWaitOptions): Promise<ReviewerWaitResult> {
  await persistReviewTimeout(
    options.stateStore,
    options.targetKey,
    options.reviewJobId ? { expectedReviewJobId: options.reviewJobId } : {},
  )
  return { status: "timeout" }
}

async function readReviewerSessionStatus(
  options: ReviewerWaitOptions,
): Promise<"busy" | "retry" | "idle" | "unknown"> {
  if (!options.reviewJobId || !options.directory || !options.reviewClient?.session?.status) return "unknown"

  try {
    const result = await callPromiseWithTimeout(
      options.reviewClient.session.status({
        query: { directory: options.directory },
        responseStyle: "data",
        throwOnError: true,
      }),
      Math.max(options.pollIntervalMs, MIN_REVIEWER_STATUS_TIMEOUT_MS),
    )
    if (result.status === "timeout") return "unknown"

    const sessionStatuses = extractSessionStatuses(result.value)
    const sessionStatus = sessionStatuses[options.reviewJobId]
    if (!isRecord(sessionStatus)) return "unknown"

    const type = sessionStatus.type
    if (type === "busy" || type === "retry" || type === "idle") return type
    return "unknown"
  } catch {
    return "unknown"
  }
}

function extractSessionStatuses(response: unknown): Record<string, unknown> {
  if (isRecord(response)) {
    const data = response.data
    if (isRecord(data)) return data
    return response
  }

  return {}
}

function isReviewerSessionActive(status: "busy" | "retry" | "idle" | "unknown"): boolean {
  return status === "busy" || status === "retry"
}

function formatReviewerSessionState(status: "busy" | "retry" | "idle" | "unknown"): string {
  if (status === "retry") return "retrying"
  if (status === "busy") return "running"
  return "active"
}

function hasReviewJobMarker(content: string, reviewJobId: string): boolean {
  const marker = `Review-Job-ID: ${reviewJobId}`
  return content.split(/\r?\n/).some((line) => line.trim() === marker)
}

function readStateVerdict(review: ReviewRecord | undefined):
  | { verdict: ReviewVerdict; comment?: string }
  | undefined {
  if (review?.status !== "approved" && review?.status !== "changes-requested") return undefined
  if (!review.lastVerdict) return undefined
  return { verdict: review.lastVerdict, comment: review.lastReviewerComment }
}

async function callToolWithTimeout(
  client: Pick<ChorusMcpClient, "callTool">,
  timeoutMs: number,
  name: string,
  args: Record<string, unknown>,
  scope?: ChorusToolScope,
): Promise<{ status: "completed"; value: unknown } | { status: "timeout" }> {
  const call = client.callTool<unknown>(name, args, scope)
  void call.catch(() => {})

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<{ status: "timeout" }>((resolve) => {
    timeoutId = setTimeout(() => resolve({ status: "timeout" }), timeoutMs)
  })

  try {
    return await Promise.race([
      call.then((value) => ({ status: "completed", value }) as const),
      timeout,
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

async function callPromiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<{ status: "completed"; value: T } | { status: "timeout" }> {
  void promise.catch(() => {})

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<{ status: "timeout" }>((resolve) => {
    timeoutId = setTimeout(() => resolve({ status: "timeout" }), timeoutMs)
  })

  try {
    return await Promise.race([
      promise.then((value) => ({ status: "completed", value }) as const),
      timeout,
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function extractCommentContents(response: unknown): string[] {
  const comments = Array.isArray(response) ? response : isRecord(response) && Array.isArray(response.comments) ? response.comments : []
  const contents: string[] = []

  for (const comment of comments) {
    const content = extractCommentContent(comment)
    if (content) contents.push(content)
  }

  return contents
}

function extractCommentContent(comment: unknown): string | undefined {
  if (typeof comment === "string") return comment
  if (!isRecord(comment)) return undefined

  if (typeof comment.content === "string") return comment.content
  if (typeof comment.text === "string") return comment.text
  if (typeof comment.body === "string") return comment.body
  return undefined
}

function tryParseVerdict(content: string): ReviewVerdict | undefined {
  try {
    return parseVerdict(content)
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
