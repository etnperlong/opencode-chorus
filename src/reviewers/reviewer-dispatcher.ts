import type { createOpencodeClient } from "@opencode-ai/sdk"
import { PROPOSAL_REVIEWER_AGENT, TASK_REVIEWER_AGENT } from "./reviewer-agents"

type OpenCodeClient = ReturnType<typeof createOpencodeClient>

type DispatchReviewerOptions = {
  client: OpenCodeClient
  directory: string
  targetUuid: string
  round: number
  maxRounds: number
  parentSessionID?: string
  onSessionCreated?: (sessionId: string) => Promise<void>
}

export async function dispatchProposalReviewer(options: DispatchReviewerOptions): Promise<string> {
  return dispatchReviewer({
    ...options,
    agent: PROPOSAL_REVIEWER_AGENT,
    title: `Chorus proposal review: ${options.targetUuid} (@${PROPOSAL_REVIEWER_AGENT} subagent)`,
    prompt: `Review Chorus proposal ${options.targetUuid}.\n\nReview round: ${options.round} of ${options.maxRounds}.\n\nFetch the proposal and comments through Chorus tools, post exactly one chorus_add_comment review, and end with VERDICT: PASS, VERDICT: PASS WITH NOTES, or VERDICT: FAIL.`,
  })
}

export async function dispatchTaskReviewer(options: DispatchReviewerOptions): Promise<string> {
  return dispatchReviewer({
    ...options,
    agent: TASK_REVIEWER_AGENT,
    title: `Chorus task review: ${options.targetUuid} (@${TASK_REVIEWER_AGENT} subagent)`,
    prompt: `Review Chorus task ${options.targetUuid}.\n\nReview round: ${options.round} of ${options.maxRounds}.\n\nFetch the task, proposal context, and comments through Chorus tools, inspect only what is needed, post exactly one chorus_add_comment review, and end with VERDICT: PASS, VERDICT: PASS WITH NOTES, or VERDICT: FAIL.`,
  })
}

async function dispatchReviewer(
  options: DispatchReviewerOptions & { agent: string; title: string; prompt: string },
): Promise<string> {
  const body: { title: string; parentID?: string } = { title: options.title }
  if (options.parentSessionID) body.parentID = options.parentSessionID

  const session = await options.client.session.create({
    query: { directory: options.directory },
    body,
    responseStyle: "data",
    throwOnError: true,
  })
  const sessionId = extractSessionId(session)
  if (!sessionId) throw new Error(`Failed to create ${options.agent} session`)
  await options.onSessionCreated?.(sessionId)

  await options.client.session.promptAsync({
    path: { id: sessionId },
    query: { directory: options.directory },
    body: {
      agent: options.agent,
      parts: [
        {
          type: "text",
          text: `${options.prompt}\n\nInclude this exact line in the Chorus comment content before or near the verdict line:\nReview-Job-ID: ${sessionId}`,
        },
      ],
    },
    throwOnError: true,
  })

  return sessionId
}

function extractSessionId(session: { data?: { id?: string }; id?: string } | undefined): string | undefined {
  return session?.data?.id ?? session?.id
}
