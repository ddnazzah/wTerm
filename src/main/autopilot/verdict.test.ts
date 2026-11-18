import { describe, expect, it } from 'vitest'
import { parseVerdict, REPLY_MAX_CHARS } from './verdict'

/** What `claude -p --output-format json` prints, around the model's text. */
const envelope = (result: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result, ...extra })

const verdictJson = (v: Record<string, unknown>): string => JSON.stringify(v)

describe('parseVerdict', () => {
  it('reads a continue verdict with its reply', () => {
    const out = envelope(
      verdictJson({ action: 'continue', reply: 'Take option A; write the tests next.', summary: 'Chose A' })
    )

    expect(parseVerdict(out)).toEqual({
      action: 'continue',
      reply: 'Take option A; write the tests next.',
      summary: 'Chose A',
    })
  })

  it('finds the verdict when the model wraps it in prose or a code fence', () => {
    const text = 'Here is my decision:\n```json\n{"action":"done","reply":"","summary":"Export shipped"}\n```'

    expect(parseVerdict(envelope(text))?.action).toBe('done')
  })

  it('handles braces inside reply strings', () => {
    const text = verdictJson({ action: 'continue', reply: 'Use `{ a: 1 }` as the default', summary: 's' })

    expect(parseVerdict(envelope(text))?.reply).toBe('Use `{ a: 1 }` as the default')
  })

  it('ignores login-shell noise printed before the envelope', () => {
    const out = `Last login: Tue\nwelcome!\n${envelope(verdictJson({ action: 'escalate', reply: 'Push to main?', summary: 'Needs push approval' }))}`

    expect(parseVerdict(out)?.action).toBe('escalate')
  })

  it.each([
    ['an unknown action', { action: 'maybe', reply: 'x', summary: 's' }],
    ['a missing summary', { action: 'done', reply: '' }],
    ['a continue with no reply', { action: 'continue', reply: '  ', summary: 's' }],
    ['a continue whose reply is an essay', { action: 'continue', reply: 'x'.repeat(REPLY_MAX_CHARS + 1), summary: 's' }],
  ])('rejects %s', (_label, value) => {
    expect(parseVerdict(envelope(verdictJson(value)))).toBeNull()
  })

  it('rejects an error envelope even if it contains JSON', () => {
    const out = envelope(verdictJson({ action: 'continue', reply: 'go', summary: 's' }), { is_error: true })

    expect(parseVerdict(out)).toBeNull()
  })

  it('rejects output with no envelope at all', () => {
    expect(parseVerdict('command not found: claude')).toBeNull()
    expect(parseVerdict('')).toBeNull()
  })

  it('rejects a result that has no JSON object in it', () => {
    expect(parseVerdict(envelope('I think you should continue.'))).toBeNull()
  })
})
