import { describe, expect, test } from 'vitest'
import {
  MAX_DIGEST_CHARS,
  MAX_MESSAGE_CHARS,
  buildEvents,
  buildPrompt,
  digestSession,
  packDigests,
  planRead,
  pruneTracked,
  redactSecrets,
  TRACKED_MAX_AGE_MS,
  sliceCompleteLines,
  todoId,
  validateResult,
} from './collect-lib.mjs'

const SESSION = '11111111-1111-4111-8111-111111111111'
const OTHER_SESSION = '22222222-2222-4222-8222-222222222222'

const user = (content, extra = {}) =>
  JSON.stringify({
    type: 'user',
    cwd: '/repo',
    gitBranch: 'feat/x',
    timestamp: '2026-11-02T10:00:00.000Z',
    message: { role: 'user', content },
    ...extra,
  })
const assistant = (text, extra = {}) =>
  JSON.stringify({
    type: 'assistant',
    cwd: '/repo',
    gitBranch: 'feat/x',
    timestamp: '2026-11-02T10:01:00.000Z',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
    ...extra,
  })

describe('planRead', () => {
  test('reads from the cursor when the delta fits', () => {
    expect(planRead({ size: 900, cursor: 100, maxBytes: 1000 })).toEqual({
      start: 100,
      truncated: false,
    })
  })

  test('takes only the tail when the delta exceeds the limit', () => {
    expect(planRead({ size: 5000, cursor: 100, maxBytes: 1000 })).toEqual({
      start: 4000,
      truncated: true,
    })
  })

  test('restarts from zero when the file shrank below the cursor', () => {
    expect(planRead({ size: 50, cursor: 100, maxBytes: 1000 })).toEqual({
      start: 0,
      truncated: false,
    })
  })
})

describe('sliceCompleteLines', () => {
  test('holds back a trailing partial line so the cursor can retry it', () => {
    const buf = Buffer.from('{"a":1}\n{"b":')
    const result = sliceCompleteLines(buf, false)
    expect(result.text).toBe('{"a":1}\n')
    expect(result.consumed).toBe(8)
  })

  test('drops the leading fragment of a truncated read', () => {
    const buf = Buffer.from('tail-of-old-line\n{"a":1}\n')
    expect(sliceCompleteLines(buf, true).text).toBe('{"a":1}\n')
    expect(sliceCompleteLines(buf, true).consumed).toBe(buf.length)
  })

  test('consumes nothing when no line is complete', () => {
    expect(sliceCompleteLines(Buffer.from('{"a":'), false)).toEqual({ text: '', consumed: 0 })
  })

  test('counts bytes rather than characters for multi-byte text', () => {
    const buf = Buffer.from('{"t":"é"}\n')
    expect(sliceCompleteLines(buf, false).consumed).toBe(buf.length)
  })
})

describe('redactSecrets', () => {
  test.each([
    ['anthropic key', 'key sk-ant-api03-abcdefghijklmnopqrstuvwx'],
    ['github token', 'token ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
    ['aws key', 'id AKIAABCDEFGHIJKLMNOP'],
    ['bearer header', 'Authorization: Bearer abc.def.ghi-jkl'],
    ['assignment', 'PASSWORD=hunter2hunter2'],
    ['json field', '"api_key": "abcd1234efgh"'],
  ])('removes %s', (_name, input) => {
    const out = redactSecrets(input)
    expect(out).toContain('[redacted]')
    expect(out).not.toMatch(/abcdefghijkl|AKIAABCD|abc\.def|hunter2|abcd1234/)
  })

  test('removes a whole private key block', () => {
    const key = '-----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY-----'
    expect(redactSecrets(`before ${key} after`)).toBe('before [redacted] after')
  })

  test('leaves ordinary prose alone', () => {
    const prose = 'The password reset flow needs a token check before merge'
    expect(redactSecrets(prose)).toBe(prose)
  })
})

describe('digestSession', () => {
  test('keeps typed user text and the latest assistant reply with context', () => {
    const text = [user('first'), assistant('old reply'), user('second'), assistant('new reply')]
    const digest = digestSession(SESSION, text.join('\n'))
    expect(digest).toEqual({
      sessionId: SESSION,
      cwd: '/repo',
      branch: 'feat/x',
      lastAt: '2026-11-02T10:01:00.000Z',
      user: ['first', 'second'],
      lastAssistant: 'new reply',
    })
  })

  test('returns null when the delta has no conversation', () => {
    const noise = JSON.stringify({ type: 'file-history-snapshot', snapshot: {} })
    expect(digestSession(SESSION, noise)).toBeNull()
  })

  test.each([
    ['meta messages', user('injected', { isMeta: true })],
    ['subagent messages', user('from subagent', { isSidechain: true })],
    ['headless sdk sessions', user('scripted', { entrypoint: 'sdk-cli' })],
  ])('ignores %s', (_name, line) => {
    expect(digestSession(SESSION, line)).toBeNull()
  })

  test('drops tool results but keeps text blocks in the same message', () => {
    const line = user([
      { type: 'tool_result', content: 'huge tool output' },
      { type: 'text', text: 'please look' },
    ])
    expect(digestSession(SESSION, line).user).toEqual(['please look'])
  })

  test('strips harness tags from user text', () => {
    const line = user('<system-reminder>ignore me</system-reminder>real question')
    expect(digestSession(SESSION, line).user).toEqual(['real question'])
  })

  test('drops a message that was only harness tags', () => {
    expect(digestSession(SESSION, user('<command-name>/clear</command-name>'))).toBeNull()
  })

  test('skips malformed lines without losing the good ones', () => {
    const digest = digestSession(SESSION, `not json\n${user('kept')}\n{"type":`)
    expect(digest.user).toEqual(['kept'])
  })

  test('caps message length and message count', () => {
    const long = 'x'.repeat(MAX_MESSAGE_CHARS + 500)
    const lines = Array.from({ length: 20 }, (_, i) => user(`${i}-${long}`))
    const digest = digestSession(SESSION, lines.join('\n'))
    expect(digest.user).toHaveLength(8)
    expect(digest.user[0].startsWith('12-')).toBe(true)
    expect(digest.user[0].length).toBe(MAX_MESSAGE_CHARS)
  })

  test('redacts secrets before they enter the digest', () => {
    const digest = digestSession(SESSION, assistant('use ghp_abcdefghijklmnopqrstuvwxyz0123456789'))
    expect(digest.lastAssistant).toBe('use [redacted]')
  })
})

describe('packDigests', () => {
  const digest = (sessionId, lastAt, size) => ({
    sessionId,
    lastAt,
    cwd: '/r',
    branch: '',
    user: ['x'.repeat(size)],
    lastAssistant: '',
  })

  test('takes the oldest first so a busy session cannot starve others', () => {
    const packed = packDigests([digest('new', '2026-11-02', 10), digest('old', '2026-11-01', 10)])
    expect(packed.included.map((d) => d.sessionId)).toEqual(['old', 'new'])
    expect(packed.deferred).toEqual([])
  })

  test('defers what does not fit to the next run', () => {
    const size = Math.floor(MAX_DIGEST_CHARS * 0.7)
    const packed = packDigests([digest('a', '1', size), digest('b', '2', size)])
    expect(packed.included.map((d) => d.sessionId)).toEqual(['a'])
    expect(packed.deferred.map((d) => d.sessionId)).toEqual(['b'])
  })
})

describe('buildPrompt', () => {
  test('includes the date, digests, and the todos already tracked per session', () => {
    const digests = [{ sessionId: SESSION, cwd: '/r', branch: 'b', lastAt: 't', user: ['hi'], lastAssistant: 'ok' }]
    const tracked = { abc: { sessionId: SESSION, title: 'Approve PR', at: 't' }, zzz: { sessionId: OTHER_SESSION, title: 'Other', at: 't' } }
    const prompt = buildPrompt(digests, tracked, '2026-11-02')
    expect(prompt).toContain('2026-11-02')
    expect(prompt).toContain(SESSION)
    expect(prompt).toContain('Approve PR')
    expect(prompt).not.toContain('Other')
  })
})

describe('validateResult', () => {
  const digests = [{ sessionId: SESSION, cwd: '/r', branch: 'b' }]
  const tracked = { known: { sessionId: SESSION, title: 'Known', at: 't' }, foreign: { sessionId: OTHER_SESSION, title: 'F', at: 't' } }
  const good = { sessionId: SESSION, title: 'Approve PR', detail: 'Waiting', bucket: 'now' }

  test('accepts a well-formed add and a tracked resolve', () => {
    const out = validateResult({ add: [good], resolved: ['known'] }, digests, tracked)
    expect(out.adds).toEqual([good])
    expect(out.resolved).toEqual(['known'])
  })

  test('rejects an invented session id', () => {
    const out = validateResult({ add: [{ ...good, sessionId: OTHER_SESSION }], resolved: [] }, digests, tracked)
    expect(out.adds).toEqual([])
  })

  test('rejects a bucket outside the enum and an empty title', () => {
    const add = [{ ...good, bucket: 'someday' }, { ...good, title: '   ' }]
    expect(validateResult({ add, resolved: [] }, digests, tracked).adds).toEqual([])
  })

  test('rejects resolving a todo that belongs to a session not in this digest', () => {
    const out = validateResult({ add: [], resolved: ['foreign', 'unknown'] }, digests, tracked)
    expect(out.resolved).toEqual([])
  })

  test('caps new todos per session', () => {
    const add = Array.from({ length: 6 }, (_, i) => ({ ...good, title: `t${i}` }))
    expect(validateResult({ add, resolved: [] }, digests, tracked).adds).toHaveLength(3)
  })

  test('throws on output of the wrong shape so cursors do not advance', () => {
    expect(() => validateResult({ todos: [] }, digests, tracked)).toThrow(/shape/)
    expect(() => validateResult(null, digests, tracked)).toThrow(/shape/)
  })
})

describe('todoId', () => {
  test('is stable across whitespace and case, and differs by session', () => {
    expect(todoId(SESSION, 'Approve  the PR')).toBe(todoId(SESSION, 'approve the pr '))
    expect(todoId(SESSION, 'x')).not.toBe(todoId(OTHER_SESSION, 'x'))
    expect(todoId(SESSION, 'x')).toMatch(/^[a-f0-9]{16}$/)
  })
})

describe('pruneTracked', () => {
  test('forgets todos past the age limit and keeps recent ones', () => {
    const nowMs = Date.parse('2026-11-02T12:00:00.000Z')
    const ago = (ms) => ({ sessionId: SESSION, title: 't', at: new Date(nowMs - ms).toISOString() })
    const kept = pruneTracked({ old: ago(TRACKED_MAX_AGE_MS + 1000), recent: ago(1000) }, nowMs)
    expect(Object.keys(kept)).toEqual(['recent'])
  })
})

describe('buildEvents', () => {
  const digests = [{ sessionId: SESSION, cwd: '/repo', branch: 'feat/x' }]
  const now = '2026-11-02T12:00:00.000Z'
  const add = { sessionId: SESSION, title: 'Approve PR', detail: 'Waiting', bucket: 'now' }

  test('adds carry session context, and resolves follow', () => {
    const { events } = buildEvents({ adds: [add], resolved: ['old'] }, digests, {}, now)
    expect(events).toEqual([
      {
        type: 'add',
        id: todoId(SESSION, 'Approve PR'),
        title: 'Approve PR',
        detail: 'Waiting',
        bucket: 'now',
        sessionId: SESSION,
        cwd: '/repo',
        branch: 'feat/x',
        createdAt: now,
      },
      { type: 'resolve', id: 'old' },
    ])
  })

  test('does not re-add a todo that is already tracked', () => {
    const tracked = { [todoId(SESSION, 'Approve PR')]: { sessionId: SESSION, title: 'Approve PR', at: now } }
    const { events, nowCount } = buildEvents({ adds: [add], resolved: [] }, digests, tracked, now)
    expect(events).toEqual([])
    expect(nowCount).toBe(0)
  })

  test('counts only new Now items for the notification', () => {
    const adds = [add, { ...add, title: 'Later', bucket: 'future' }]
    expect(buildEvents({ adds, resolved: [] }, digests, {}, now).nowCount).toBe(1)
  })

  test('returns tracked state with adds in and resolved out, without mutating input', () => {
    const tracked = { old: { sessionId: SESSION, title: 'Old', at: now } }
    const result = buildEvents({ adds: [add], resolved: ['old'] }, digests, tracked, now)
    expect(Object.keys(result.tracked)).toEqual([todoId(SESSION, 'Approve PR')])
    expect(tracked.old).toBeDefined()
  })
})
