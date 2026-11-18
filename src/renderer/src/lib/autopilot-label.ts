import type { AutopilotDecision, AutopilotSnapshot } from '@shared/types'

// What a session row says about its Autopilot: the halo on its dot, the line in
// the dot's tooltip, and the decisions in its right-click menu. Kept out of the
// components so the wording, which is the user's only window onto choices made
// on their behalf, is tested.

/** How the dot's Autopilot halo is drawn. */
export type AutopilotMode = 'off' | 'on' | 'deciding'

/** Decisions listed in the right-click menu, newest first. */
export const MENU_DECISIONS = 5

const VERB: Record<AutopilotDecision['action'], string> = {
  continue: 'Replied',
  done: 'Goal reached',
  escalate: 'Handed back',
}

/** A session with no state yet reads as off rather than guessing. */
export function autopilotMode(snapshot: AutopilotSnapshot | undefined): AutopilotMode {
  if (!snapshot?.enabled) return 'off'
  return snapshot.deciding ? 'deciding' : 'on'
}

/** One decision as the user reads it: the reply sent, or why it stopped. */
export function decisionLine(d: AutopilotDecision): string {
  const text = d.action === 'continue' ? d.reply : d.summary
  return `${VERB[d.action]}: ${text}`
}

/** The Autopilot sentence appended to the dot's tooltip. */
export function autopilotSummary(snapshot: AutopilotSnapshot | undefined): string {
  const mode = autopilotMode(snapshot)
  if (mode === 'off' || !snapshot) return 'Autopilot off'
  if (mode === 'deciding') return 'Autopilot deciding a reply'
  const count = snapshot.continuations
  const head = `Autopilot on · ${count} ${count === 1 ? 'reply' : 'replies'}`
  const last = snapshot.log.at(-1)
  return last ? `${head} · last: ${decisionLine(last)}` : head
}

/** The newest decisions for the right-click menu. */
export function menuDecisions(snapshot: AutopilotSnapshot | undefined): string[] {
  if (!snapshot) return []
  return snapshot.log.slice(-MENU_DECISIONS).reverse().map(decisionLine)
}
