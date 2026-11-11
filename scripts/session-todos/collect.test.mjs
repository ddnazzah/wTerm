// Runs the real collector as a child process against temp dirs and a fake `claude`,
// so cursors, retries, and file output are tested the way launchd runs them.

import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

const run = promisify(execFile)
const COLLECT = fileURLToPath(new URL('./collect.mjs', import.meta.url))
const SESSION = '11111111-1111-4111-8111-111111111111'
const SECOND_SESSION = '22222222-2222-4222-8222-222222222222'

let root, dataDir, projectDir, fakeClaude, callLog

/** A fake `claude` that records its stdin and args, then replies as the test says. */
async function writeFakeClaude(body) {
  await fs.writeFile(
    fakeClaude,
    `#!/bin/sh\ncat >> "${callLog}"\nprintf '%s\\n' "$*" > "${callLog}.args"\n${body}\n`,
    { mode: 0o755 }
  )
}

const replyWith = (output) =>
  writeFakeClaude(`cat <<'JSON'\n${JSON.stringify({ is_error: false, structured_output: output })}\nJSON`)

const transcriptLine = (text, role = 'user') =>
  JSON.stringify({
    type: role,
    cwd: '/repo',
    gitBranch: 'main',
    timestamp: new Date().toISOString(),
    message: { role, content: role === 'user' ? text : [{ type: 'text', text }] },
  }) + '\n'

const appendTranscript = (text, session = SESSION) =>
  fs.appendFile(join(projectDir, `${session}.jsonl`), transcriptLine(text))
const appendAgentReply = (text, session = SESSION) =>
  fs.appendFile(join(projectDir, `${session}.jsonl`), transcriptLine(text, 'assistant'))

async function collect() {
  const env = {
    ...process.env,
    WTERM_TODOS_DIR: dataDir,
    CLAUDE_PROJECTS_DIR: join(root, 'projects'),
    CLAUDE_BIN: fakeClaude,
    WTERM_TODOS_NO_NOTIFY: '1',
  }
  try {
    await run(process.execPath, [COLLECT], { env })
    return 0
  } catch (err) {
    return err.code
  }
}

const readJson = async (name) => JSON.parse(await fs.readFile(join(dataDir, name), 'utf-8'))
const readEvents = async () => {
  const text = await fs.readFile(join(dataDir, 'suggestions.jsonl'), 'utf-8').catch(() => '')
  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line))
}
const callCount = async () => {
  const text = await fs.readFile(callLog, 'utf-8').catch(() => '')
  return text.split('Today is ').length - 1
}

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'session-todos-'))
  dataDir = join(root, 'data')
  projectDir = join(root, 'projects', '-repo')
  fakeClaude = join(root, 'claude')
  callLog = join(root, 'calls.txt')
  await fs.mkdir(projectDir, { recursive: true })
})

afterEach(() => fs.rm(root, { recursive: true, force: true }))

describe('collector run', () => {
  const add = { sessionId: SESSION, title: 'Approve the PR', detail: 'Waiting', bucket: 'now' }

  test('appends a validated todo with session context and records success', async () => {
    await appendTranscript('please approve the PR')
    await replyWith({ add: [add], resolved: [] })

    expect(await collect()).toBe(0)

    const [event] = await readEvents()
    expect(event).toMatchObject({ type: 'add', title: 'Approve the PR', cwd: '/repo', branch: 'main' })
    const status = await readJson('status.json')
    expect(status.lastError).toBeNull()
    expect(status.lastSuccessAt).toBe(status.lastRunAt)
  })

  test('records the folder resume needs, not the one the session moved to', async () => {
    const line = (cwd, text) =>
      JSON.stringify({
        type: 'user',
        cwd,
        gitBranch: 'main',
        timestamp: new Date().toISOString(),
        message: { role: 'user', content: text },
      }) + '\n'
    const file = join(projectDir, `${SESSION}.jsonl`)
    await fs.appendFile(file, line('/repo', 'start') + line('/repo/packages/web', 'moved'))
    await replyWith({ add: [add], resolved: [] })

    await collect()

    expect((await readEvents())[0].cwd).toBe('/repo')
  })

  test('finds the resume folder at the head when new lines are all from elsewhere', async () => {
    const line = (cwd, text) =>
      JSON.stringify({
        type: 'user',
        cwd,
        timestamp: new Date().toISOString(),
        message: { role: 'user', content: text },
      }) + '\n'
    const file = join(projectDir, `${SESSION}.jsonl`)
    await fs.appendFile(file, line('/repo', 'start'))
    await replyWith({ add: [], resolved: [] })
    await collect()

    await fs.appendFile(file, line('/repo/packages/web', 'later'))
    await replyWith({ add: [add], resolved: [] })
    await collect()

    expect((await readEvents())[0].cwd).toBe('/repo')
  })

  test('records the failure when claude exits without reading its prompt', async () => {
    // Tracked titles grow the prompt past the pipe's buffer, so the write is still
    // going when claude exits and breaks the pipe.
    const at = new Date().toISOString()
    const tracked = Object.fromEntries(
      Array.from({ length: 3000 }, (_, index) => [
        `id${index}`,
        { sessionId: SESSION, title: 'y'.repeat(120), at },
      ])
    )
    await fs.mkdir(dataDir, { recursive: true })
    await fs.writeFile(join(dataDir, 'state.json'), JSON.stringify({ cursors: {}, tracked }))
    await appendTranscript('hello')
    await fs.writeFile(fakeClaude, '#!/bin/sh\necho "bad flag" >&2\nexit 3\n', { mode: 0o755 })

    expect(await collect()).toBe(1)

    expect((await readJson('status.json')).lastError).toContain('claude exited 3')
  })

  test('runs the model with tools off and without saving a session', async () => {
    await appendTranscript('hello')
    await replyWith({ add: [], resolved: [] })
    await collect()
    const args = await fs.readFile(`${callLog}.args`, 'utf-8')
    expect(args).toContain('--no-session-persistence')
    expect(args).toMatch(/--tools\s+--no-session-persistence/)
  })

  test('does not call the model when nothing changed since the last run', async () => {
    await appendTranscript('hello')
    await replyWith({ add: [], resolved: [] })
    await collect()
    await collect()
    expect(await callCount()).toBe(1)
  })

  test('sends only new messages on the next run', async () => {
    await appendTranscript('first message')
    await replyWith({ add: [], resolved: [] })
    await collect()
    await fs.rm(callLog)
    await appendTranscript('second message')
    await collect()
    const prompt = await fs.readFile(callLog, 'utf-8')
    expect(prompt).toContain('second message')
    expect(prompt).not.toContain('first message')
  })

  test('a failed model call keeps cursors, records the error, then retries', async () => {
    await appendTranscript('important message')
    await writeFakeClaude('echo "auth expired" >&2; exit 1')

    expect(await collect()).toBe(1)
    expect((await readJson('status.json')).lastError).toContain('auth expired')
    await expect(readJson('state.json')).rejects.toThrow()

    await fs.rm(callLog)
    await replyWith({ add: [add], resolved: [] })
    expect(await collect()).toBe(0)
    expect(await fs.readFile(callLog, 'utf-8')).toContain('important message')
    expect(await readEvents()).toHaveLength(1)
  })

  test('a failure keeps the previous lastSuccessAt so staleness stays visible', async () => {
    await appendTranscript('one')
    await replyWith({ add: [], resolved: [] })
    await collect()
    const { lastSuccessAt } = await readJson('status.json')

    await appendTranscript('two')
    await writeFakeClaude('exit 1')
    await collect()
    expect((await readJson('status.json')).lastSuccessAt).toBe(lastSuccessAt)
  })

  test('malformed model output is a failure and writes no events', async () => {
    await appendTranscript('hello')
    await replyWith({ wrong: true })
    expect(await collect()).toBe(1)
    expect(await readEvents()).toEqual([])
  })

  test('tells the model about tracked todos and does not duplicate them', async () => {
    await appendTranscript('one')
    await replyWith({ add: [add], resolved: [] })
    await collect()

    await fs.rm(callLog)
    await appendAgentReply('still waiting on you')
    await collect()
    expect(await fs.readFile(callLog, 'utf-8')).toContain('Approve the PR')
    expect(await readEvents()).toHaveLength(1)
  })

  test('closes a todo once the user writes in its session again', async () => {
    await appendTranscript('one')
    await replyWith({ add: [add], resolved: [] })
    await collect()
    const [added] = await readEvents()

    await fs.rm(callLog)
    await appendTranscript('yes, go ahead')
    await replyWith({ add: [], resolved: [] })
    await collect()
    expect(await fs.readFile(callLog, 'utf-8')).not.toContain('Approve the PR')
    expect((await readEvents()).slice(1)).toEqual([{ type: 'resolve', id: added.id }])
    expect((await readJson('state.json')).tracked).toEqual({})
  })

  test('keeps a replied todo open when the model says it is still pending', async () => {
    await appendTranscript('one')
    await replyWith({ add: [add], resolved: [] })
    await collect()

    await appendTranscript('not yet, later')
    await collect()
    const events = await readEvents()
    expect(events.map((event) => event.type)).toEqual(['add'])
    expect(Object.keys((await readJson('state.json')).tracked)).toEqual([events[0].id])
  })

  test('skips old transcripts on first sight instead of backfilling history', async () => {
    await appendTranscript('ancient history')
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    await fs.utimes(join(projectDir, `${SESSION}.jsonl`), old, old)
    await replyWith({ add: [], resolved: [] })

    expect(await collect()).toBe(0)
    expect(await callCount()).toBe(0)
    expect(Object.values((await readJson('state.json')).cursors)).toHaveLength(1)
  })

  test('ignores files that are not session transcripts', async () => {
    await fs.writeFile(join(projectDir, 'notes.jsonl'), transcriptLine('not a session'))
    await replyWith({ add: [], resolved: [] })
    await collect()
    expect(await callCount()).toBe(0)
  })

  test('a session the model invented is dropped while real ones are kept', async () => {
    await appendTranscript('one')
    await replyWith({ add: [add, { ...add, sessionId: SECOND_SESSION, title: 'Fake' }], resolved: [] })
    await collect()
    expect((await readEvents()).map((event) => event.title)).toEqual(['Approve the PR'])
  })
})
