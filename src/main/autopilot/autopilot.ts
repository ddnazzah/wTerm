import type { AutopilotDecision, AutopilotSnapshot } from '@shared/types'
import type { AgentHookEvent, AgentHookMessage } from '../agent/hook-event'
import { applyPolicy, INITIAL_PILOT_STATE, MAX_CONTINUATIONS, type PilotState } from './policy'
import { buildSupervisorPrompt } from './supervisor'
import type { TranscriptView } from './transcript'
import { parseVerdict, type Verdict } from './verdict'

// Autopilot: answer an agent's stops on the user's behalf until its goal is met.
//
// Sits between the hook server and the PTY manager. Every hook event passes
// through `handle`; only a Stop on an enabled session is held while the
// supervisor decides. Everything else goes straight to the activity machine, so
// with Autopilot off wTerm behaves exactly as it did before.

export type { AutopilotSnapshot }

export interface AutopilotDeps {
  /** Run the supervisor; resolves with its raw stdout. */
  decide: (prompt: string) => Promise<string>
  read: (transcriptPath: string) => Promise<TranscriptView>
  /** Feed an event to the session's activity machine. */
  apply: (terminalId: string, event: AgentHookEvent) => void
  /** Told whenever a session's Autopilot state changes. */
  changed: (snapshot: AutopilotSnapshot) => void
  now?: () => number
  maxContinuations?: number
}

interface Session {
  state: PilotState
  log: AutopilotDecision[]
}

/** Decisions kept per session; older ones fall off. */
const LOG_MAX = 50

const blankSession = (): Session => ({ state: INITIAL_PILOT_STATE, log: [] })

export class Autopilot {
  private readonly overrides = new Map<string, boolean>()
  private readonly sessions = new Map<string, Session>()
  /**
   * Bumped whenever a session's situation changes under an in-flight decision:
   * a new Stop, a user prompt, or the session ending. A decision that comes back
   * to a different generation is stale and dropped.
   */
  private readonly generations = new Map<string, number>()

  constructor(
    private readonly deps: AutopilotDeps,
    private defaultOn: boolean
  ) {}

  setDefault(on: boolean): void {
    this.defaultOn = on
  }

  isEnabled(terminalId: string): boolean {
    return this.overrides.get(terminalId) ?? this.defaultOn
  }

  setEnabled(terminalId: string, on: boolean): void {
    // No generation bump: a decision in flight when this is switched off still
    // has to release its hook, and decideStop checks isEnabled for exactly that.
    this.overrides.set(terminalId, on)
    this.emit(terminalId)
  }

  /** The terminal is gone; drop everything held for it. */
  forget(terminalId: string): void {
    this.overrides.delete(terminalId)
    this.sessions.delete(terminalId)
    this.generations.delete(terminalId)
  }

  snapshot(terminalId: string): AutopilotSnapshot {
    const session = this.sessions.get(terminalId) ?? blankSession()
    return {
      terminalId,
      enabled: this.isEnabled(terminalId),
      continuations: session.state.continuations,
      log: [...session.log],
    }
  }

  /**
   * Route one hook event. Returns a promise only for a Stop it is deciding —
   * the hook server holds the agent's hook open until it settles.
   */
  handle(message: AgentHookMessage): Promise<string | null> | void {
    const { terminalId, event } = message
    if (event.kind === 'turnDone' && this.isEnabled(terminalId)) return this.decideStop(message)
    if (event.kind === 'promptSubmitted') this.userTookTurn(terminalId)
    if (event.kind === 'sessionEnd') this.userTookTurn(terminalId)
    this.deps.apply(terminalId, event)
  }

  /**
   * A new prompt from the user is a new or refined goal; an ended session will
   * start a fresh one. Either way: fresh counters, but the log is kept, because
   * it is the report of what was done on the user's behalf.
   */
  private userTookTurn(terminalId: string): void {
    this.bump(terminalId)
    const session = this.sessions.get(terminalId)
    if (!session) return
    this.sessions.set(terminalId, { ...session, state: INITIAL_PILOT_STATE })
    this.emit(terminalId)
  }

  private async decideStop(message: AgentHookMessage): Promise<string | null> {
    const { terminalId } = message
    const generation = this.bump(terminalId)
    const before = this.sessions.get(terminalId) ?? blankSession()
    const { verdict: proposed, lastAssistant } = await this.consult(message.transcriptPath, before.log)

    if (this.generations.get(terminalId) !== generation) return null // overtaken; the hook is gone
    if (!this.isEnabled(terminalId)) {
      // Switched off while deciding: behave as if Autopilot had never held it.
      this.deps.apply(terminalId, message.event)
      return null
    }
    const session = this.sessions.get(terminalId) ?? blankSession()
    const { verdict, state } = applyPolicy(
      session.state,
      proposed,
      lastAssistant,
      this.deps.maxContinuations ?? MAX_CONTINUATIONS
    )
    const record: AutopilotDecision = { at: this.now(), ...verdict }
    this.sessions.set(terminalId, { state, log: [...session.log, record].slice(-LOG_MAX) })
    this.emit(terminalId)
    return this.act(terminalId, verdict)
  }

  /** Ask the supervisor. Never throws: any failure becomes an escalation. */
  private async consult(
    transcriptPath: string | null,
    log: readonly AutopilotDecision[]
  ): Promise<{ verdict: Verdict; lastAssistant: string }> {
    let lastAssistant = ''
    try {
      if (!transcriptPath) throw new Error('the hook did not say where the transcript is')
      const view = await this.deps.read(transcriptPath)
      lastAssistant = view.lastAssistant
      const verdict = parseVerdict(await this.deps.decide(buildSupervisorPrompt(view, log)))
      if (!verdict) throw new Error('the supervisor gave no valid verdict')
      return { verdict, lastAssistant }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      return {
        verdict: { action: 'escalate', reply: '', summary: `Autopilot could not decide: ${reason}` },
        lastAssistant,
      }
    }
  }

  private act(terminalId: string, verdict: Verdict): string | null {
    if (verdict.action === 'continue') {
      return JSON.stringify({ decision: 'block', reason: verdict.reply })
    }
    const detail =
      verdict.action === 'done'
        ? `Goal reached: ${verdict.summary}`
        : `Autopilot needs you: ${verdict.reply || verdict.summary}`
    this.deps.apply(terminalId, { kind: 'turnDone', detail })
    return null
  }

  private bump(terminalId: string): number {
    const next = (this.generations.get(terminalId) ?? 0) + 1
    this.generations.set(terminalId, next)
    return next
  }

  private emit(terminalId: string): void {
    this.deps.changed(this.snapshot(terminalId))
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }
}
