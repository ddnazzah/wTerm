import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentHookMessage } from './hook-event'

// Exercises the real relay script against the real server over loopback: the
// path Claude Code takes on every hook. Only Electron's `app` is stubbed.
const userData = join(tmpdir(), `wterm-hook-server-${process.pid}`)
vi.mock('electron', () => ({ app: { getPath: () => userData } }))

const { AgentHookServer } = await import('./hook-server')

/** Run the relay as Claude would: payload on stdin, terminal id in the env. */
function runRelay(
  relayPath: string,
  payload: Record<string, unknown>,
  terminalId: string
): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    const child = execFile(
      relayPath,
      { env: { ...process.env, WTERM_TERMINAL_ID: terminalId } },
      (err, stdout) => resolve({ stdout, code: err ? ((err as { code?: number }).code ?? 1) : 0 })
    )
    child.stdin?.end(JSON.stringify(payload))
  })
}

const stop = { hook_event_name: 'Stop', session_id: 's1', transcript_path: '/t/s1.jsonl' }
const prompt = { hook_event_name: 'UserPromptSubmit', session_id: 's1' }

describe('AgentHookServer + relay', () => {
  let server: InstanceType<typeof AgentHookServer>

  beforeEach(async () => {
    await fs.mkdir(userData, { recursive: true })
    server = new AgentHookServer()
  })

  afterEach(async () => {
    await server.stop()
    await fs.rm(userData, { recursive: true, force: true })
  })

  it('prints the handler\'s reply for a held Stop, so Claude reads it as the hook decision', async () => {
    const block = JSON.stringify({ decision: 'block', reason: 'Take option A' })
    server.onMessage(async () => block)
    await server.start()

    const result = await runRelay(server.relayPath(), stop, 'term-1')

    expect(result.code).toBe(0)
    expect(result.stdout).toBe(block)
  })

  it('prints nothing when the handler does not hold the event', async () => {
    const seen: AgentHookMessage[] = []
    server.onMessage((m) => {
      seen.push(m)
    })
    await server.start()

    const result = await runRelay(server.relayPath(), prompt, 'term-1')

    expect(result).toEqual({ stdout: '', code: 0 })
    expect(seen.map((m) => m.event.kind)).toEqual(['promptSubmitted'])
  })

  it('prints nothing when a held decision resolves to "let it stop"', async () => {
    server.onMessage(async () => null)
    await server.start()

    expect(await runRelay(server.relayPath(), stop, 'term-1')).toEqual({ stdout: '', code: 0 })
  })

  it('prints nothing and still exits 0 when the handler fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    server.onMessage(async () => {
      throw new Error('boom')
    })
    await server.start()

    expect(await runRelay(server.relayPath(), stop, 'term-1')).toEqual({ stdout: '', code: 0 })
    error.mockRestore()
  })

  it('passes the transcript path and terminal id through to the handler', async () => {
    let got: AgentHookMessage | null = null
    server.onMessage(async (m) => {
      got = m
      return null
    })
    await server.start()

    await runRelay(server.relayPath(), stop, 'term-9')

    expect(got).toMatchObject({ terminalId: 'term-9', transcriptPath: '/t/s1.jsonl', event: { kind: 'turnDone' } })
  })

  it('drops events with no terminal id — which is how the supervisor\'s own hooks are ignored', async () => {
    const handler = vi.fn(async () => 'should not print')
    server.onMessage(handler)
    await server.start()

    const result = await runRelay(server.relayPath(), stop, '')

    expect(result.stdout).toBe('')
    expect(handler).not.toHaveBeenCalled()
  })

  it('exits 0 silently when wTerm is not running', async () => {
    server.onMessage(async () => 'x')
    await server.start()
    const relay = server.relayPath()
    await server.stop()

    expect(await runRelay(relay, stop, 'term-1')).toEqual({ stdout: '', code: 0 })
  })
})
