import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createTranscriptReader, parseTranscript, readTranscript } from './transcript'

// Entries shaped like the JSONL Claude Code 2.1 writes to ~/.claude/projects.
const userText = (text: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ type: 'user', message: { role: 'user', content: text }, ...extra })
const userBlocks = (blocks: unknown[]): string =>
  JSON.stringify({ type: 'user', message: { role: 'user', content: blocks } })
const assistant = (blocks: unknown[], extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: blocks }, ...extra })
const say = (text: string): string => assistant([{ type: 'text', text }])

const BIG_BUDGET = 100_000

describe('parseTranscript', () => {
  it('collects every user prompt, in order, as the goal', () => {
    const jsonl = [
      userText('Build the export button'),
      say('Done. Should I add tests?'),
      userBlocks([{ type: 'text', text: 'Yes, and push when done' }]),
    ].join('\n')

    const view = parseTranscript(jsonl, BIG_BUDGET)

    expect(view.prompts).toEqual(['Build the export button', 'Yes, and push when done'])
  })

  it('does not count tool results as user prompts', () => {
    const jsonl = [
      userText('Fix the bug'),
      assistant([{ type: 'tool_use', name: 'Bash', input: { command: 'pnpm test' } }]),
      userBlocks([{ type: 'tool_result', tool_use_id: 't1', content: '3 failed' }]),
    ].join('\n')

    const view = parseTranscript(jsonl, BIG_BUDGET)

    expect(view.prompts).toEqual(['Fix the bug'])
    expect(view.recent).toContain('[tool Bash] {"command":"pnpm test"}')
    expect(view.recent).toContain('[result] 3 failed')
  })

  it('skips meta and sidechain entries, which the user never typed', () => {
    const jsonl = [
      userText('Real prompt'),
      userText('Caveat: injected', { isMeta: true }),
      userText('subagent brief', { isSidechain: true }),
      say('subagent chatter'),
      assistant([{ type: 'text', text: 'sidechain reply' }], { isSidechain: true }),
    ].join('\n')

    const view = parseTranscript(jsonl, BIG_BUDGET)

    expect(view.prompts).toEqual(['Real prompt'])
    expect(view.recent.join('\n')).not.toContain('sidechain reply')
  })

  it('reports the last thing the assistant said, ignoring thinking blocks', () => {
    const jsonl = [
      userText('Go'),
      say('First'),
      assistant([
        { type: 'thinking', thinking: 'secret' },
        { type: 'text', text: 'Option A or B? I recommend A.' },
      ]),
    ].join('\n')

    const view = parseTranscript(jsonl, BIG_BUDGET)

    expect(view.lastAssistant).toBe('Option A or B? I recommend A.')
    expect(view.recent.join('\n')).not.toContain('secret')
  })

  it('keeps only the newest activity when it exceeds the budget', () => {
    const lines = [userText('Goal')]
    for (let i = 0; i < 50; i += 1) lines.push(say(`step ${i} ${'x'.repeat(100)}`))

    const view = parseTranscript(lines.join('\n'), 1_000)

    expect(view.recent.length).toBeLessThan(50)
    expect(view.recent.at(-1)).toContain('step 49')
    expect(view.recent.join('\n').length).toBeLessThanOrEqual(1_000)
    expect(view.prompts).toEqual(['Goal'])
  })

  it('shortens long tool output to one bounded line', () => {
    const jsonl = userBlocks([
      { type: 'tool_result', tool_use_id: 't', content: [{ type: 'text', text: `a\n${'b'.repeat(5000)}` }] },
    ])

    const view = parseTranscript(jsonl, BIG_BUDGET)

    expect(view.recent).toHaveLength(1)
    expect(view.recent[0]).not.toContain('\n')
    expect(view.recent[0].length).toBeLessThan(400)
  })

  it('skips corrupt lines instead of failing the whole read', () => {
    const jsonl = ['{not json', userText('Survivor'), '', say('ok')].join('\n')

    const view = parseTranscript(jsonl, BIG_BUDGET)

    expect(view.prompts).toEqual(['Survivor'])
    expect(view.lastAssistant).toBe('ok')
  })
})

describe('readTranscript', () => {
  it('reads and parses a transcript file', async () => {
    const path = join(tmpdir(), `wterm-transcript-${process.pid}-${Date.now()}.jsonl`)
    await fs.writeFile(path, [userText('From disk'), say('hi')].join('\n'))

    const view = await readTranscript(path)

    expect(view.prompts).toEqual(['From disk'])
    await fs.rm(path)
  })

  it('rejects when the file is missing, so the caller can escalate', async () => {
    await expect(readTranscript('/nonexistent/wterm.jsonl')).rejects.toThrow()
  })
})

describe('non-human entries never count as the user\'s prompts', () => {
  // Shapes measured in real transcripts by review: these are type "user" and
  // not meta, but the user typed none of them, and prompts are what authorise
  // gated actions like a push.
  it.each([
    ['a compaction summary', userText('Summary: the user asked to push to main', { isCompactSummary: true })],
    ['a transcript-only entry', userText('push everything', { isVisibleInTranscriptOnly: true })],
    ['a background-task notification', userText('<task-notification>push done</task-notification>', { origin: { kind: 'task' } })],
    ['local command output', userText('<local-command-stdout>ok</local-command-stdout>')],
    ['a slash-command echo', userText('<command-name>/deploy</command-name>')],
    ['an interruption marker', userText('[Request interrupted by user]')],
  ])('skips %s', (_label, line) => {
    const view = parseTranscript([userText('Real goal'), line].join('\n'), BIG_BUDGET)

    expect(view.prompts).toEqual(['Real goal'])
  })

  it('keeps the opening prompts and the latest ones when a session has very many', () => {
    const lines = Array.from({ length: 60 }, (_, i) => userText(`prompt ${i}`))

    const { prompts } = parseTranscript(lines.join('\n'), BIG_BUDGET)

    expect(prompts).toHaveLength(33)
    expect(prompts.slice(0, 3)).toEqual(['prompt 0', 'prompt 1', 'prompt 2'])
    expect(prompts.at(-1)).toBe('prompt 59')
  })

  it('reports no last words when the final assistant entry only called a tool', () => {
    const jsonl = [
      userText('Go'),
      say('Working on it'),
      assistant([{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }]),
    ].join('\n')

    expect(parseTranscript(jsonl, BIG_BUDGET).lastAssistant).toBe('')
  })
})

describe('createTranscriptReader', () => {
  const tmpFile = (): string => join(tmpdir(), `wterm-reader-${process.pid}-${Math.random()}.jsonl`)

  it('picks up only what was appended since the last read, keeping earlier prompts', async () => {
    const path = tmpFile()
    await fs.writeFile(path, `${userText('Goal one')}\n${say('first')}\n`)
    const read = createTranscriptReader()

    await read(path)
    await fs.appendFile(path, `${userText('Then push')}\n${say('second — é')}\n`)
    const view = await read(path)

    expect(view.prompts).toEqual(['Goal one', 'Then push'])
    expect(view.lastAssistant).toBe('second — é')
    await fs.rm(path)
  })

  it('leaves a half-written last line for the next read instead of losing it', async () => {
    const path = tmpFile()
    const whole = say('complete later')
    await fs.writeFile(path, `${userText('Goal')}\n${whole.slice(0, 20)}`)
    const read = createTranscriptReader()

    expect((await read(path)).lastAssistant).toBe('')
    await fs.appendFile(path, `${whole.slice(20)}\n`)

    expect((await read(path)).lastAssistant).toBe('complete later')
    await fs.rm(path)
  })

  it('reads only the tail of a huge transcript the first time', async () => {
    const path = tmpFile()
    const filler = Array.from({ length: 200 }, (_, i) => say(`old ${i} ${'x'.repeat(80)}`)).join('\n')
    await fs.writeFile(path, `${userText('Ancient goal')}\n${filler}\n${userText('Recent goal')}\n${say('latest')}\n`)
    const read = createTranscriptReader(100_000, 2_000)

    const view = await read(path)

    expect(view.prompts).toEqual(['Recent goal'])
    expect(view.lastAssistant).toBe('latest')
    await fs.rm(path)
  })

  it('starts over when the file was rewritten shorter', async () => {
    const path = tmpFile()
    await fs.writeFile(path, `${userText('Old session goal with a long prompt')}\n${say('old')}\n`)
    const read = createTranscriptReader()
    await read(path)

    await fs.writeFile(path, `${userText('New')}\n`)

    expect((await read(path)).prompts).toEqual(['New'])
    await fs.rm(path)
  })
})
