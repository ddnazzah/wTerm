import { promises as fs } from 'node:fs'

// A bounded, supervisor-ready view of a Claude Code transcript.
//
// The transcript is the JSONL Claude writes per session (the Stop hook names
// it in `transcript_path`). Autopilot needs two things out of it: what the user
// asked for — every prompt they typed, which together are the goal and the only
// source of authorisation — and what the agent has been doing lately.
// Everything not typed by the user (thinking, meta injections, subagent
// sidechains, compaction summaries, background-task notices, local command
// output) is dropped, because none of it may widen what the user authorised.

export interface TranscriptView {
  /** Prompts the user typed, oldest first (bounded; see PROMPTS_KEPT_*). This is the goal. */
  prompts: string[]
  /** Recent activity, oldest first, one line per item, within the budget. */
  recent: string[]
  /** The text of the assistant's final entry — usually the question it stopped on. */
  lastAssistant: string
}

/** Default size of `recent`, in characters. Enough for several turns. */
export const TRANSCRIPT_BUDGET_CHARS = 24_000
/** A single prompt longer than this is truncated (pasted logs, mostly). */
const PROMPT_MAX_CHARS = 4_000
/** Tool calls and results are shown as one line of at most this many chars. */
const TOOL_LINE_MAX_CHARS = 300
/** The opening prompts set the goal; the latest ones refine it. Both are kept. */
const PROMPTS_KEPT_FIRST = 3
const PROMPTS_KEPT_LAST = 30
/**
 * On first sight of a transcript, read at most this much of its end. Real
 * transcripts reach hundreds of MB, and this runs in Electron's main process.
 * Later reads only take the bytes appended since.
 */
export const TRANSCRIPT_MAX_INITIAL_BYTES = 8 * 1024 * 1024

/** User-role text that Claude Code wrote, not the user. */
const NON_HUMAN_PREFIXES = [
  '<task-notification',
  '<local-command-',
  '<command-name>',
  '<command-message>',
  '<command-args>',
  '[Request interrupted',
]

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
  isCompactSummary?: boolean
  isVisibleInTranscriptOnly?: boolean
  origin?: unknown
  message?: { content?: unknown }
}

/** Accumulated state; a reader keeps one per transcript and appends to it. */
export interface Collected {
  prompts: string[]
  lines: string[]
  lastAssistant: string
}

export const emptyCollected = (): Collected => ({ prompts: [], lines: [], lastAssistant: '' })

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((b: Block) => (typeof b?.text === 'string' ? b.text : '')).join(' ')
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

function isFromUser(entry: Entry): boolean {
  return !(entry.isMeta || entry.isSidechain || entry.isCompactSummary || entry.isVisibleInTranscriptOnly || entry.origin)
}

function blocksOf(entry: Entry): Block[] {
  const content = entry.message?.content
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  return Array.isArray(content) ? (content as Block[]) : []
}

function keepPrompts(prompts: string[]): string[] {
  if (prompts.length <= PROMPTS_KEPT_FIRST + PROMPTS_KEPT_LAST) return prompts
  return [...prompts.slice(0, PROMPTS_KEPT_FIRST), ...prompts.slice(-PROMPTS_KEPT_LAST)]
}

function collectUser(blocks: Block[], into: Collected): Collected {
  const results = blocks.filter((b) => b.type === 'tool_result')
  if (results.length > 0) {
    const lines = results.map((r) => `[result] ${oneLine(resultText(r.content), TOOL_LINE_MAX_CHARS)}`)
    return { ...into, lines: [...into.lines, ...lines] }
  }
  const text = blocks.map((b) => (b.type === 'text' ? (b.text ?? '') : '')).join('\n').trim()
  if (text.length === 0 || NON_HUMAN_PREFIXES.some((p) => text.startsWith(p))) return into
  const prompt = text.slice(0, PROMPT_MAX_CHARS)
  return {
    ...into,
    prompts: keepPrompts([...into.prompts, prompt]),
    lines: [...into.lines, `user: ${oneLine(prompt, TOOL_LINE_MAX_CHARS)}`],
  }
}

function collectAssistant(blocks: Block[], into: Collected): Collected {
  const lines: string[] = []
  const texts: string[] = []
  for (const b of blocks) {
    if (b.type === 'text' && b.text) {
      lines.push(`assistant: ${b.text.trim()}`)
      texts.push(b.text.trim())
    } else if (b.type === 'tool_use') {
      lines.push(`[tool ${b.name ?? '?'}] ${oneLine(JSON.stringify(b.input ?? {}), TOOL_LINE_MAX_CHARS)}`)
    }
  }
  if (lines.length === 0) return into
  // An entry that only calls tools has no words: the last thing said is unknown,
  // not the previous turn's text (which would look like "no progress").
  return { ...into, lines: [...into.lines, ...lines], lastAssistant: texts.join('\n') }
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

/** Fold more JSONL into `into`, keeping `lines` within the budget. */
export function collect(jsonl: string, into: Collected, budgetChars: number): Collected {
  let acc = into
  for (const line of jsonl.split('\n')) {
    const entry = parseEntry(line)
    if (!entry || !isFromUser(entry)) continue
    if (entry.type === 'user') acc = collectUser(blocksOf(entry), acc)
    else if (entry.type === 'assistant') acc = collectAssistant(blocksOf(entry), acc)
  }
  return { ...acc, lines: tail(acc.lines, budgetChars) }
}

export function toView(c: Collected): TranscriptView {
  return { prompts: c.prompts, recent: c.lines, lastAssistant: c.lastAssistant }
}

export function parseTranscript(jsonl: string, budgetChars: number): TranscriptView {
  return toView(collect(jsonl, emptyCollected(), budgetChars))
}

interface Cursor {
  /** Bytes consumed so far, always at a line boundary. */
  offset: number
  collected: Collected
}

async function readFrom(path: string, start: number, end: number): Promise<string> {
  const handle = await fs.open(path, 'r')
  try {
    const buffer = Buffer.alloc(end - start)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start)
    return buffer.subarray(0, bytesRead).toString('utf8')
  } finally {
    await handle.close()
  }
}

/**
 * A transcript reader that remembers where it got to in each file, so a
 * session's tenth Stop reads only what was appended since its ninth.
 */
export function createTranscriptReader(
  budgetChars: number = TRANSCRIPT_BUDGET_CHARS,
  maxInitialBytes: number = TRANSCRIPT_MAX_INITIAL_BYTES
): (path: string) => Promise<TranscriptView> {
  const cursors = new Map<string, Cursor>()
  return async (path) => {
    const { size } = await fs.stat(path)
    const known = cursors.get(path)
    // A file that shrank was rewritten; start over.
    const cursor = known && known.offset <= size ? known : null
    const start = cursor ? cursor.offset : Math.max(0, size - maxInitialBytes)
    let text = await readFrom(path, start, size)
    // Starting mid-file lands mid-line; drop the fragment.
    if (!cursor && start > 0) text = text.slice(text.indexOf('\n') + 1)
    // Only consume complete lines; a half-written last line is read next time.
    const complete = text.slice(0, text.lastIndexOf('\n') + 1)
    // Measured in bytes, not characters: transcripts carry multi-byte text.
    const consumed = size - Buffer.byteLength(text.slice(complete.length), 'utf8')
    const collected = collect(complete, cursor?.collected ?? emptyCollected(), budgetChars)
    cursors.set(path, { offset: consumed, collected })
    return toView(collected)
  }
}

/** Read a whole transcript once. Rejects if it cannot be read. */
export async function readTranscript(
  path: string,
  budgetChars: number = TRANSCRIPT_BUDGET_CHARS
): Promise<TranscriptView> {
  return parseTranscript(await fs.readFile(path, 'utf8'), budgetChars)
}
