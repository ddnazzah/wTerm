import { promises as fs } from 'node:fs'

// A bounded, supervisor-ready view of a Claude Code transcript.
//
// The transcript is the JSONL Claude writes per session (the Stop hook names
// it in `transcript_path`). Autopilot needs two things out of it: what the user
// asked for — every prompt they typed, which together are the goal — and what
// the agent has been doing lately. Everything else (thinking, meta injections,
// subagent sidechains) is dropped.

export interface TranscriptView {
  /** Every prompt the user typed, oldest first. This is the goal. */
  prompts: string[]
  /** Recent activity, oldest first, one line per item, within the budget. */
  recent: string[]
  /** The assistant's final words — usually the question it stopped on. */
  lastAssistant: string
}

/** Default size of `recent`, in characters. Enough for several turns. */
export const TRANSCRIPT_BUDGET_CHARS = 24_000
/** A single prompt longer than this is truncated (pasted logs, mostly). */
const PROMPT_MAX_CHARS = 4_000
/** Tool calls and results are shown as one line of at most this many chars. */
const TOOL_LINE_MAX_CHARS = 300

interface Block {
  type?: string
  text?: string
  name?: string
  input?: unknown
  content?: unknown
}

interface Entry {
  type?: string
  isMeta?: boolean
  isSidechain?: boolean
  message?: { content?: unknown }
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((b: Block) => (typeof b?.text === 'string' ? b.text : ''))
    .join(' ')
}

function parseEntry(line: string): Entry | null {
  if (line.trim().length === 0) return null
  try {
    const parsed: unknown = JSON.parse(line)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Entry) : null
  } catch {
    return null
  }
}

function blocksOf(entry: Entry): Block[] {
  const content = entry.message?.content
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  return Array.isArray(content) ? (content as Block[]) : []
}

interface Collected {
  prompts: string[]
  lines: string[]
  lastAssistant: string
}

function collectUser(blocks: Block[], into: Collected): void {
  const results = blocks.filter((b) => b.type === 'tool_result')
  for (const r of results) into.lines.push(`[result] ${oneLine(resultText(r.content), TOOL_LINE_MAX_CHARS)}`)
  if (results.length > 0) return
  const text = blocks.map((b) => (b.type === 'text' ? (b.text ?? '') : '')).join('\n').trim()
  if (text.length === 0) return
  const prompt = text.slice(0, PROMPT_MAX_CHARS)
  into.prompts.push(prompt)
  into.lines.push(`user: ${oneLine(prompt, TOOL_LINE_MAX_CHARS)}`)
}

function collectAssistant(blocks: Block[], into: Collected): void {
  for (const b of blocks) {
    if (b.type === 'text' && b.text) {
      into.lines.push(`assistant: ${b.text.trim()}`)
      into.lastAssistant = b.text.trim()
    } else if (b.type === 'tool_use') {
      into.lines.push(`[tool ${b.name ?? '?'}] ${oneLine(JSON.stringify(b.input ?? {}), TOOL_LINE_MAX_CHARS)}`)
    }
  }
}

/** Keep the newest lines whose joined length fits the budget. */
function tail(lines: string[], budget: number): string[] {
  const kept: string[] = []
  let used = 0
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const cost = lines[i].length + (kept.length > 0 ? 1 : 0)
    if (used + cost > budget) break
    kept.unshift(lines[i])
    used += cost
  }
  return kept
}

export function parseTranscript(jsonl: string, budgetChars: number): TranscriptView {
  const collected: Collected = { prompts: [], lines: [], lastAssistant: '' }
  for (const line of jsonl.split('\n')) {
    const entry = parseEntry(line)
    if (!entry || entry.isMeta || entry.isSidechain) continue
    if (entry.type === 'user') collectUser(blocksOf(entry), collected)
    else if (entry.type === 'assistant') collectAssistant(blocksOf(entry), collected)
  }
  return {
    prompts: collected.prompts,
    recent: tail(collected.lines, budgetChars),
    lastAssistant: collected.lastAssistant,
  }
}

/** Read a transcript from disk. Rejects if it cannot be read. */
export async function readTranscript(
  path: string,
  budgetChars: number = TRANSCRIPT_BUDGET_CHARS
): Promise<TranscriptView> {
  const text = await fs.readFile(path, 'utf8')
  return parseTranscript(text, budgetChars)
}
