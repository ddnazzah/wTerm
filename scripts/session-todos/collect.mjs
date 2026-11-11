#!/usr/bin/env node
// One collector run, started by launchd. Reads what changed in Claude Code
// transcripts, asks a tool-less model for the user's todos, and appends them to
// suggestions.jsonl for wTerm to import. See
// docs/superpowers/specs/2026-11-02-session-todos-design.md.

import { execFile, spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import {
  MAX_READ_BYTES,
  RESULT_SCHEMA,
  SYSTEM_PROMPT,
  buildEvents,
  buildPrompt,
  digestSession,
  packDigests,
  planRead,
  pruneTracked,
  repliedTodos,
  stillAnswered,
  withoutIds,
  sliceCompleteLines,
  validateResult,
  findResumeCwd,
  localDate,
} from './collect-lib.mjs'

const DATA_DIR =
  process.env.WTERM_TODOS_DIR ?? join(homedir(), 'Library/Application Support/wTerm/session-todos')
const PROJECTS_DIR = process.env.CLAUDE_PROJECTS_DIR ?? join(homedir(), '.claude/projects')
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude'
const SHOULD_NOTIFY = process.env.WTERM_TODOS_NO_NOTIFY !== '1'

const STATE_PATH = join(DATA_DIR, 'state.json')
const STATUS_PATH = join(DATA_DIR, 'status.json')
const SUGGESTIONS_PATH = join(DATA_DIR, 'suggestions.jsonl')

const MODEL = 'haiku'
const CLAUDE_TIMEOUT_MS = 3 * 60 * 1000
const FIRST_SEEN_LOOKBACK_MS = 24 * 60 * 60 * 1000
const MAX_ERROR_CHARS = 300
const HEAD_BYTES = 256 * 1024
const SESSION_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/

async function readJson(path, fallback) {
  try {
    return JSON.parse(await fs.readFile(path, 'utf-8'))
  } catch (err) {
    if (err.code === 'ENOENT') return fallback
    throw err
  }
}

async function writeJsonAtomic(path, value) {
  const tmp = `${path}.tmp`
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf-8')
  await fs.rename(tmp, path)
}

async function listTranscripts() {
  const dirs = await fs.readdir(PROJECTS_DIR, { withFileTypes: true })
  const perDir = await Promise.all(
    dirs
      .filter((dir) => dir.isDirectory())
      .map(async (dir) => {
        const path = join(PROJECTS_DIR, dir.name)
        const names = await fs.readdir(path)
        return names.filter((name) => SESSION_FILE.test(name)).map((name) => join(path, name))
      })
  )
  return perDir.flat()
}

async function readHead(path) {
  const handle = await fs.open(path, 'r')
  try {
    const { buffer, bytesRead } = await handle.read({ buffer: Buffer.alloc(HEAD_BYTES) })
    return buffer.subarray(0, bytesRead).toString('utf-8')
  } finally {
    await handle.close()
  }
}

/** Unread lines may all be from a later folder, so fall back to how the session began. */
async function resumeFolder(path, text, latestCwd) {
  const dirName = basename(dirname(path))
  return findResumeCwd(text, dirName) ?? findResumeCwd(await readHead(path), dirName) ?? latestCwd
}

async function readDelta(path, size, cursor) {
  const { start, truncated } = planRead({ size, cursor, maxBytes: MAX_READ_BYTES })
  const handle = await fs.open(path, 'r')
  try {
    const buffer = Buffer.alloc(size - start)
    await handle.read(buffer, 0, buffer.length, start)
    const { text, consumed } = sliceCompleteLines(buffer, truncated)
    return { text, nextCursor: start + consumed }
  } finally {
    await handle.close()
  }
}

/** Read one transcript. Returns its new cursor, and a digest if it has news. */
async function scanTranscript(path, cursors, nowMs) {
  const { size, mtimeMs } = await fs.stat(path)
  const cursor = cursors[path]
  if (cursor === size) return { path, cursor, digest: null }
  if (cursor === undefined && nowMs - mtimeMs > FIRST_SEEN_LOOKBACK_MS) {
    return { path, cursor: size, digest: null }
  }
  const { text, nextCursor } = await readDelta(path, size, cursor ?? 0)
  const digest = digestSession(basename(path, '.jsonl'), text)
  if (!digest) return { path, cursor: nextCursor, digest }
  const cwd = await resumeFolder(path, text, digest.cwd)
  return { path, cursor: nextCursor, digest: { ...digest, cwd } }
}

function claudeArgs() {
  return [
    '-p',
    '--model', MODEL,
    '--tools', '',
    '--no-session-persistence',
    '--disable-slash-commands',
    '--strict-mcp-config',
    '--setting-sources', '',
    '--output-format', 'json',
    '--json-schema', JSON.stringify(RESULT_SCHEMA),
    '--system-prompt', SYSTEM_PROMPT,
  ]
}

function parseClaudeOutput(stdout) {
  const parsed = JSON.parse(stdout)
  if (parsed.is_error) throw new Error(`claude reported an error: ${parsed.result}`)
  return parsed.structured_output
}

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, claudeArgs(), {
      cwd: DATA_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: CLAUDE_TIMEOUT_MS,
    })
    let stdout = ''
    let stderr = ''
    let stdinError = null
    // A CLI that exits before reading its prompt breaks this pipe. Without a listener
    // that kills the run before status.json can record why.
    child.stdin.on('error', (err) => (stdinError = err))
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`claude exited ${code}: ${stderr || stdout}`))
      else if (stdinError) reject(stdinError)
      else resolve(stdout)
    })
    child.stdin.end(prompt)
  }).then(parseClaudeOutput)
}

function notify(nowCount) {
  if (!SHOULD_NOTIFY || nowCount === 0) return
  const label = nowCount === 1 ? '1 new todo needs' : `${nowCount} new todos need`
  const script = `display notification "${label} you now" with title "wTerm"`
  execFile('osascript', ['-e', script], (err) => {
    if (err) console.error('[session-todos] notification failed:', err.message)
  })
}

async function appendEvents(events) {
  if (events.length === 0) return
  const lines = events.map((event) => JSON.stringify(event)).join('\n')
  await fs.appendFile(SUGGESTIONS_PATH, `${lines}\n`, 'utf-8')
}

/** Ask the model about included digests. Returns the tracked map to persist. */
async function extractTodos(included, tracked, nowIso) {
  const { open, replied } = repliedTodos(tracked, included)
  const prompt = buildPrompt(included, open, localDate(new Date(nowIso)))
  const validated = validateResult(await runClaude(prompt), included, open)
  const answered = stillAnswered(replied, validated.adds)
  // A re-raised todo stays tracked, so buildEvents sees it as known and adds no copy.
  const result = buildEvents(validated, included, withoutIds(tracked, answered), nowIso)
  const closed = answered.map((id) => ({ type: 'resolve', id }))
  await appendEvents([...closed, ...result.events])
  notify(result.nowCount)
  return result.tracked
}

/**
 * Cursors advance only for what this run finished with: sessions held back, or
 * sent to a model call that failed, keep their old cursor and are read again.
 */
function nextCursors(scans, deferred, previous) {
  const held = new Set(deferred.map((digest) => digest.sessionId))
  return Object.fromEntries(
    scans
      .map(({ path, cursor }) => {
        const isHeld = held.has(basename(path, '.jsonl'))
        return [path, isHeld ? previous[path] : cursor]
      })
      .filter(([, cursor]) => cursor !== undefined)
  )
}

async function collect(now) {
  const state = await readJson(STATE_PATH, { cursors: {}, tracked: {} })
  const paths = await listTranscripts()
  const scans = await Promise.all(paths.map((path) => scanTranscript(path, state.cursors, now)))
  const digests = scans.map((scan) => scan.digest).filter(Boolean)
  const { included, deferred } = packDigests(digests)

  const nowIso = new Date(now).toISOString()
  const tracked = pruneTracked(state.tracked, now)
  const nextTracked = included.length > 0 ? await extractTodos(included, tracked, nowIso) : tracked

  await writeJsonAtomic(STATE_PATH, {
    cursors: nextCursors(scans, deferred, state.cursors),
    tracked: nextTracked,
  })
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true })
  const previous = await readJson(STATUS_PATH, {})
  const lastRunAt = new Date().toISOString()
  try {
    await collect(Date.now())
    await writeJsonAtomic(STATUS_PATH, { lastRunAt, lastSuccessAt: lastRunAt, lastError: null })
  } catch (err) {
    const lastError = String(err.message ?? err).slice(0, MAX_ERROR_CHARS)
    await writeJsonAtomic(STATUS_PATH, { ...previous, lastRunAt, lastError })
    console.error('[session-todos] run failed:', lastError)
    process.exitCode = 1
  }
}

await main()
