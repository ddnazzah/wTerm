// The supervisor's answer, and the strict parse that guards it.
//
// The supervisor is a model, so its output is untrusted text. Anything that is
// not exactly a well-formed verdict is rejected here, and the caller turns a
// rejection into "escalate" — the safe failure is stopping and telling the user,
// never continuing on a guess.

export type VerdictAction = 'continue' | 'done' | 'escalate'

export interface Verdict {
  action: VerdictAction
  /** For `continue`: the instruction sent to the agent. Otherwise the open question, if any. */
  reply: string
  /** One line for the user: what happened, or why it stopped. */
  summary: string
}

const ACTIONS: ReadonlySet<string> = new Set(['continue', 'done', 'escalate'])
/** A reply longer than this is not a nudge, it is the supervisor doing the work. */
export const REPLY_MAX_CHARS = 2_000

/** The first balanced {...} in `text`, or null. Models like to wrap JSON in prose. */
function firstJsonObject(text: string): unknown {
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (ch === '\\') i += 1
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}' && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1))
      } catch {
        return null
      }
    }
  }
  return null
}

function toVerdict(value: unknown): Verdict | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (typeof v.action !== 'string' || !ACTIONS.has(v.action)) return null
  if (typeof v.summary !== 'string' || v.summary.trim().length === 0) return null
  const reply = typeof v.reply === 'string' ? v.reply.trim() : ''
  if (v.action === 'continue' && (reply.length === 0 || reply.length > REPLY_MAX_CHARS)) return null
  return { action: v.action as VerdictAction, reply, summary: v.summary.trim() }
}

/**
 * Parse `claude -p --output-format json` stdout into a verdict.
 *
 * That output is an envelope (`{"type":"result","result":"<text>",...}`) whose
 * `result` is the model's text; the verdict is the JSON object inside it. A
 * login shell may print noise before the envelope, so the envelope is the last
 * stdout line that parses.
 */
export function parseVerdict(stdout: string): Verdict | null {
  const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let envelope: unknown
    try {
      envelope = JSON.parse(lines[i])
    } catch {
      continue
    }
    const e = envelope as Record<string, unknown>
    if (e?.type !== 'result') continue
    if (e.is_error === true || typeof e.result !== 'string') return null
    return toVerdict(firstJsonObject(e.result))
  }
  return null
}
