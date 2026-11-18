import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseTranscript, readTranscript } from './transcript'

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
