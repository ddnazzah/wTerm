import type { AutopilotDecision, AutopilotSnapshot } from '@shared/types'

// What the Autopilot toggle on a session row says about itself. Kept out of the
// component so the wording — which is the user's only window onto choices made
// on their behalf — is tested.

/** Decisions listed in the tooltip, newest first. */
const TOOLTIP_DECISIONS = 8

const VERB: Record<AutopilotDecision['action'], string> = {
  continue: 'Replied',
  done: 'Goal reached',
  escalate: 'Handed back',
}

function decisionLine(d: AutopilotDecision): string {
  const text = d.action === 'continue' ? d.reply : d.summary
  return `• ${VERB[d.action]}: ${text}`
}

export function autopilotTooltip(snapshot: AutopilotSnapshot | undefined): string {
  if (!snapshot || !snapshot.enabled) {
    return 'Autopilot off: this session waits for you. Click to let it continue on its own.'
  }
  const count = snapshot.continuations
  const head = `Autopilot on: ${count} ${count === 1 ? 'reply' : 'replies'} sent for the current goal. Click to turn off.`
  if (snapshot.log.length === 0) return head
  const recent = snapshot.log.slice(-TOOLTIP_DECISIONS).reverse().map(decisionLine)
  return [head, '', ...recent].join('\n')
}
