import {
  DEFAULT_AUTO_START,
  DEFAULT_ENABLE_PROPOSAL_REVIEWER,
  DEFAULT_ENABLE_TASK_REVIEWER,
  DEFAULT_MAX_PROPOSAL_REVIEW_ROUNDS,
  DEFAULT_MAX_TASK_REVIEW_ROUNDS,
  DEFAULT_SHARED_STATE_MODE,
  DEFAULT_STATE_DIR,
} from "./defaults"

export type SharedStateMode = "compatible" | "isolated"

export type OpenCodeChorusConfig = {
  chorusUrl: string
  apiKey: string
  projectUuids: string[]
  autoStart: boolean
  enableProposalReviewer: boolean
  enableTaskReviewer: boolean
  maxProposalReviewRounds: number
  maxTaskReviewRounds: number
  stateDir: string
  sharedStateMode: SharedStateMode
}

export function resolveConfig(input: Record<string, unknown>): OpenCodeChorusConfig {
  const chorusUrl = String(input.chorusUrl ?? "").trim()
  const apiKey = String(input.apiKey ?? "").trim()

  if (!chorusUrl) throw new Error("Missing required config: chorusUrl")
  if (!apiKey) throw new Error("Missing required config: apiKey")

  return {
    chorusUrl,
    apiKey,
    projectUuids: Array.isArray(input.projectUuids)
      ? input.projectUuids.map((item) => String(item))
      : [],
    autoStart: input.autoStart === undefined ? DEFAULT_AUTO_START : Boolean(input.autoStart),
    enableProposalReviewer:
      input.enableProposalReviewer === undefined
        ? DEFAULT_ENABLE_PROPOSAL_REVIEWER
        : Boolean(input.enableProposalReviewer),
    enableTaskReviewer:
      input.enableTaskReviewer === undefined
        ? DEFAULT_ENABLE_TASK_REVIEWER
        : Boolean(input.enableTaskReviewer),
    maxProposalReviewRounds:
      typeof input.maxProposalReviewRounds === "number"
        ? input.maxProposalReviewRounds
        : DEFAULT_MAX_PROPOSAL_REVIEW_ROUNDS,
    maxTaskReviewRounds:
      typeof input.maxTaskReviewRounds === "number"
        ? input.maxTaskReviewRounds
        : DEFAULT_MAX_TASK_REVIEW_ROUNDS,
    stateDir: String(input.stateDir ?? DEFAULT_STATE_DIR),
    sharedStateMode:
      input.sharedStateMode === "isolated" ? "isolated" : DEFAULT_SHARED_STATE_MODE,
  }
}
