import type { ReviewerWaitResult } from "./reviewer-waiter"

const DEFAULT_RUNNING_TOAST_DURATION_MS = 300_000
const DEFAULT_RESULT_TOAST_DURATION_MS = 4_000
const MAX_AGGREGATED_REVIEWERS = 3

type ReviewerToastVariant = "info" | "success" | "warning" | "error"

type ReviewerToastTui = {
  showToast(input: {
    title?: string
    message?: string
    variant?: ReviewerToastVariant
    duration?: number
  }): Promise<unknown>
}

type ReviewTargetType = "proposal" | "task"

type ReviewToastState = {
  reviewJobId: string
  targetType: ReviewTargetType
  displayName: string
  round: number
  maxRounds: number
}

type ReviewerToastCoordinatorOptions = {
  tui?: ReviewerToastTui
  runningToastDurationMs?: number
  resultToastDurationMs?: number
}

export class ReviewerToastCoordinator {
  private readonly activeReviews = new Map<string, ReviewToastState>()
  private readonly runningToastDurationMs: number
  private readonly resultToastDurationMs: number

  constructor(private readonly options: ReviewerToastCoordinatorOptions = {}) {
    this.runningToastDurationMs = options.runningToastDurationMs ?? DEFAULT_RUNNING_TOAST_DURATION_MS
    this.resultToastDurationMs = options.resultToastDurationMs ?? DEFAULT_RESULT_TOAST_DURATION_MS
  }

  async started(input: ReviewToastState): Promise<void> {
    this.activeReviews.set(input.reviewJobId, input)
    await this.showRunningToast()
  }

  async finished(input: ReviewToastState & { result: ReviewerWaitResult }): Promise<void> {
    this.activeReviews.delete(input.reviewJobId)
    await this.showToast({
      title: `Reviewed ${formatReviewLabel(input)}`,
      message: reviewerResultMessage(input.result),
      variant: reviewerResultVariant(input.result),
      duration: this.resultToastDurationMs,
    })
    if (this.activeReviews.size > 0) await this.showRunningToast()
  }

  private async showRunningToast(): Promise<void> {
    const active = Array.from(this.activeReviews.values())
    if (active.length === 0) return
    if (active.length === 1) {
      const review = active[0]!
      await this.showToast({
        title: `Reviewing ${formatReviewLabel(review)}`,
        message: `Chorus ${review.targetType} reviewer is running...`,
        variant: "info",
        duration: this.runningToastDurationMs,
      })
      return
    }

    await this.showToast({
      title: `${active.length} Chorus reviewers running`,
      message: formatAggregatedRunningReviews(active),
      variant: "info",
      duration: this.runningToastDurationMs,
    })
  }

  private async showToast(input: {
    title: string
    message: string
    variant: ReviewerToastVariant
    duration: number
  }): Promise<void> {
    await this.options.tui?.showToast(input).catch(() => {})
  }
}

export function extractReviewTargetDisplayName(targetType: ReviewTargetType, snapshot: unknown): string {
  const fallback = targetType === "task" ? "Untitled task" : "Untitled proposal"
  if (!isRecord(snapshot)) return fallback

  for (const key of ["title", "name", "summary"]) {
    const value = snapshot[key]
    if (typeof value === "string") {
      const trimmed = value.trim()
      if (trimmed.length > 0) return trimmed
    }
  }

  return fallback
}

export function reviewerResultVariant(result: ReviewerWaitResult): ReviewerToastVariant {
  if (result.status === "interrupted") return "error"
  if (result.status !== "completed") return "warning"
  if (result.verdict === "PASS") return "success"
  if (result.verdict === "PASS_WITH_NOTES") return "info"
  return "warning"
}

function reviewerResultMessage(result: ReviewerWaitResult): string {
  if (result.status === "completed") return result.verdict === "PASS_WITH_NOTES" ? "PASS WITH NOTES" : result.verdict
  if (result.status === "running") return "Still running"
  if (result.status === "timeout") return "Timed out"
  if (result.status === "interrupted") return "Interrupted"
  return "Escalated"
}

function formatAggregatedRunningReviews(active: ReviewToastState[]): string {
  const visible = active.slice(0, MAX_AGGREGATED_REVIEWERS).map((review) => `- ${formatReviewLabel(review)}`)
  const hiddenCount = active.length - visible.length
  if (hiddenCount > 0) visible.push(`...and ${hiddenCount} more`)
  return visible.join("\n")
}

function formatReviewLabel(review: Pick<ReviewToastState, "displayName" | "round" | "maxRounds">): string {
  return `${review.displayName} (round ${review.round}/${review.maxRounds})`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
