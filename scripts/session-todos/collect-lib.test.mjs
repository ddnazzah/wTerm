import { describe, expect, test } from 'vitest'
import {
  MAX_DIGEST_CHARS,
  MAX_MESSAGE_CHARS,
  buildEvents,
  buildPrompt,
  digestSession,
  findResumeCwd,
  isCalendarDate,
  localDate,
  transcriptDirName,
  packDigests,
  planRead,
  pruneTracked,
  redactSecrets,
  repliedTodos,
  stillAnswered,
  withoutIds,
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

describe('findResumeCwd', () => {
  const lines = (...cwds) => cwds.map((cwd) => JSON.stringify({ type: 'user', cwd })).join('\n')
  const dir = transcriptDirName('/Users/me/app')

  test('names the transcript folder the way Claude does', () => {
    expect(transcriptDirName('/Users/me/app/.claude/worktrees/x_y')).toBe(
      '-Users-me-app--claude-worktrees-x-y'
    )
  })

  test('ignores later folders the session moved to', () => {
    expect(findResumeCwd(lines('/Users/me/app', '/Users/me/app/src', '/tmp'), dir)).toBe('/Users/me/app')
  })

  test('returns null when no line is from the resume folder', () => {
    expect(findResumeCwd(lines('/Users/me/app/src'), dir)).toBeNull()
  })

  test('tolerates partial lines and entries with no cwd', () => {
    const text = `{"cwd":"/Users/me/ap\n{"type":"summary"}\n${lines('/Users/me/app')}`
    expect(findResumeCwd(text, dir)).toBe('/Users/me/app')
  })
})

describe('localDate', () => {
  test('uses the local calendar day, not the UTC one', () => {
    expect(localDate(new Date(2026, 10, 3, 23, 30))).toBe('2026-11-03')
    expect(localDate(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05')
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
    ['quoted password with spaces', 'password="abcd1234 hunter2 abcdefghijkl"'],
    ['colon password with spaces', 'password: "abcd1234 hunter2"'],
    ['single quoted secret', "secret = 'abcd1234 hunter2'"],
    ['database url', 'postgres://admin:hunter2@db.example.com:5432/app'],
    ['slack token', 'xoxb-abcdefghijkl-1234567890'],
    ['google key', 'AIzaabcdefghijklmnopqrstuvwxyz012345678'],
    ['jwt', 'eyJabcdefghijkl.eyJabcdefghijkl.abcdefghijkl'],
  ])('removes %s', (_name, input) => {
    const out = redactSecrets(input)
    expect(out).toContain('[redacted]')
    expect(out).not.toMatch(/abcdefghijkl|AKIAABCD|abc\.def|hunter2|abcd1234/)
  })

  test('keeps the words around a quoted secret', () => {
    expect(redactSecrets('set password="a b c" then deploy')).toBe('set [redacted] then deploy')
  })

  test('leaves a url without credentials alone', () => {
    const url = 'see https://example.com:8080/docs and postgres://db.example.com/app'
    expect(redactSecrets(url)).toBe(url)
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
    expect(prompt).toContain('Monday 2026-11-02')
    expect(prompt).toContain('2026-11-02')
    expect(prompt).toContain(SESSION)
    expect(prompt).toContain('Approve PR')
    expect(prompt).not.toContain('Other')
  })
})

describe('isCalendarDate', () => {
  test.each(['2026-11-10', '2028-02-29'])('accepts %s', (value) => {
    expect(isCalendarDate(value)).toBe(true)
  })

  test.each(['2026-02-31', '2026-13-01', '10 November', '2026-11-10T00:00:00Z', '', null, undefined, 20261110])(
    'rejects %s',
    (value) => {
      expect(isCalendarDate(value)).toBe(false)
    }
  )
})

describe('validateResult dates', () => {
  const digests = [{ sessionId: SESSION }]
  const add = { sessionId: SESSION, title: 'Switch OneSignal', detail: 'd', bucket: 'future' }

  test('keeps a real due date', () => {
    const { adds } = validateResult({ add: [{ ...add, dueDate: '2026-11-10' }], resolved: [] }, digests, {})
    expect(adds[0].dueDate).toBe('2026-11-10')
  })

  test.each([null, 'next week', '2026-02-31'])('keeps the todo but drops the date %s', (dueDate) => {
    const { adds } = validateResult({ add: [{ ...add, dueDate }], resolved: [] }, digests, {})
    expect(adds).toHaveLength(1)
    expect(adds[0]).not.toHaveProperty('dueDate')
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

  test('keeps an old todo until its due day has passed', () => {
    const nowMs = new Date(2026, 10, 2, 12).getTime()
    const old = { sessionId: SESSION, title: 't', at: new Date(nowMs - TRACKED_MAX_AGE_MS - 1000).toISOString() }
    const kept = pruneTracked(
      { upcoming: { ...old, dueDate: '2026-11-10' }, today: { ...old, dueDate: '2026-11-02' }, past: { ...old, dueDate: '2026-11-01' } },
      nowMs
    )
    expect(Object.keys(kept)).toEqual(['upcoming', 'today'])
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

  test('counts a dated todo as needing attention only once its day has come', () => {
    const count = (dueDate, bucket) =>
      buildEvents({ adds: [{ ...add, bucket, dueDate }], resolved: [] }, digests, {}, now).nowCount
    expect(count('2026-11-10', 'now')).toBe(0)
    expect(count('2026-11-01', 'future')).toBe(1)
  })

  describe('the same job raised by another session', () => {
    const other = '22222222-2222-4222-8222-222222222222'
    const trackedElsewhere = (patch) => ({
      x: { sessionId: other, title: 'approve   PR', at: now, cwd: '/repo', ...patch },
    })

    test('is skipped when it has the same title in the same folder', () => {
      const { events, tracked } = buildEvents({ adds: [add], resolved: [] }, digests, trackedElsewhere(), now)
      expect(events).toEqual([])
      expect(Object.keys(tracked)).toEqual(['x'])
    })

    test('is skipped when it has the same title and day in another folder', () => {
      const dated = { ...add, dueDate: '2026-11-10' }
      const tracked = trackedElsewhere({ cwd: '/other', dueDate: '2026-11-10' })
      expect(buildEvents({ adds: [dated], resolved: [] }, digests, tracked, now).events).toEqual([])
    })

    test('two raising it in one run produce one', () => {
      const both = [...digests, { sessionId: other, cwd: '/repo', branch: 'main' }]
      const adds = [add, { ...add, sessionId: other }]
      const { events } = buildEvents({ adds, resolved: [] }, both, {}, now)
      expect(events.map((event) => event.sessionId)).toEqual([SESSION])
    })

    test('is kept when the same title is another job in another folder', () => {
      const tracked = trackedElsewhere({ cwd: '/other' })
      const { events } = buildEvents({ adds: [add], resolved: [] }, digests, tracked, now)
      expect(events.map((event) => event.type)).toEqual(['add'])
    })

    test('is kept when the matching todo is resolved in the same run', () => {
      const { events } = buildEvents({ adds: [add], resolved: ['x'] }, digests, trackedElsewhere(), now)
      expect(events.map((event) => event.type)).toEqual(['add', 'resolve'])
    })

    test('remembers folder and day so later runs can compare', () => {
      const dated = { ...add, dueDate: '2026-11-10' }
      const { tracked } = buildEvents({ adds: [dated], resolved: [] }, digests, {}, now)
      expect(tracked[todoId(SESSION, 'Approve PR')]).toMatchObject({ cwd: '/repo', dueDate: '2026-11-10' })
    })
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

describe('repliedTodos', () => {
  const tracked = {
    asked: { sessionId: SESSION, title: 'Approve PR', at: '2026-11-01T00:00:00.000Z' },
    elsewhere: { sessionId: OTHER_SESSION, title: 'Pick a name', at: '2026-11-01T00:00:00.000Z' },
  }

  test('closes a tracked todo once the user has written in its session again', () => {
    const digests = [{ sessionId: SESSION, user: ['yes, go ahead'] }]
    const { open, replied } = repliedTodos(tracked, digests)
    expect(replied).toEqual(['asked'])
    expect(Object.keys(open)).toEqual(['elsewhere'])
  })

  test('keeps a todo whose session only has new agent output', () => {
    const digests = [{ sessionId: SESSION, user: [] }]
    const { open, replied } = repliedTodos(tracked, digests)
    expect(replied).toEqual([])
    expect(open).toEqual(tracked)
  })

  test('keeps a todo whose session was not read this run', () => {
    const digests = [{ sessionId: '33333333-3333-4333-8333-333333333333', user: ['hi'] }]
    expect(repliedTodos(tracked, digests).replied).toEqual([])
  })

  test('does not mutate the tracked map it was given', () => {
    const copy = structuredClone(tracked)
    repliedTodos(tracked, [{ sessionId: SESSION, user: ['ok'] }])
    expect(tracked).toEqual(copy)
  })
})

describe('stillAnswered', () => {
  test('drops a replied todo the model raised again, so it stays open', () => {
    const adds = [{ sessionId: SESSION, title: 'Approve PR' }]
    const reraised = todoId(SESSION, 'approve  pr')
    expect(stillAnswered([reraised, 'other'], adds)).toEqual(['other'])
  })

  test('closes every replied todo when the model raised nothing', () => {
    expect(stillAnswered(['a', 'b'], [])).toEqual(['a', 'b'])
  })
})

describe('withoutIds', () => {
  test('returns a copy without the named ids and leaves the input alone', () => {
    const tracked = { a: { title: 'A' }, b: { title: 'B' } }
    expect(withoutIds(tracked, ['a', 'missing'])).toEqual({ b: { title: 'B' } })
    expect(Object.keys(tracked)).toEqual(['a', 'b'])
  })
})
