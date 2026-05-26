import { spawn, type IPty } from 'node-pty'
import { BrowserWindow } from 'electron'
import { IPC } from '@shared/types'
import type { TerminalDataPayload, TerminalExitPayload, TerminalId } from '@shared/types'
import { prepareShellIntegration } from './shell-integration'

const COALESCE_MS = 16
const MAX_BUFFER_LINES = 10_000

interface PtyEntry {
  id: TerminalId
  pty: IPty
  pendingData: string[]
  flushTimer: NodeJS.Timeout | null
  buffer: string[]
}

export class PtyManager {
  private window: BrowserWindow | null = null
  private entries = new Map<TerminalId, PtyEntry>()

  attachWindow(win: BrowserWindow): void {
    this.window = win
    win.on('closed', () => {
      this.window = null
    })
  }

  create(opts: { id: TerminalId; cwd: string; shell?: string; cols?: number; rows?: number }): void {
    if (this.entries.has(opts.id)) return

    const shell = opts.shell ?? process.env.SHELL ?? '/bin/zsh'
    const baseEnv = { ...process.env, TERM: 'xterm-256color' } as Record<string, string>
    const { args, env } = prepareShellIntegration(shell, baseEnv)
    const pty = spawn(shell, args, {
      name: 'xterm-256color',
      cols: opts.cols ?? 80,
      rows: opts.rows ?? 24,
      cwd: opts.cwd,
      env,
    })

    const entry: PtyEntry = {
      id: opts.id,
      pty,
      pendingData: [],
      flushTimer: null,
      buffer: [],
    }
    this.entries.set(opts.id, entry)

    pty.onData((data) => {
      entry.pendingData.push(data)
      entry.buffer.push(data)
      if (entry.buffer.length > MAX_BUFFER_LINES) {
        entry.buffer.splice(0, entry.buffer.length - MAX_BUFFER_LINES)
      }
      if (entry.flushTimer === null) {
        entry.flushTimer = setTimeout(() => this.flush(entry), COALESCE_MS)
      }
    })

    pty.onExit(({ exitCode, signal }) => {
      this.flush(entry)
      this.entries.delete(opts.id)
      const payload: TerminalExitPayload = { id: opts.id, exitCode, signal }
      this.window?.webContents.send(IPC.terminals.exit, payload)
    })
  }

  write(id: TerminalId, data: string): void {
    const entry = this.entries.get(id)
    entry?.pty.write(data)
  }

  resize(id: TerminalId, cols: number, rows: number): void {
    const entry = this.entries.get(id)
    if (!entry) return
    try {
      entry.pty.resize(Math.max(1, Math.floor(cols)), Math.max(1, Math.floor(rows)))
    } catch {
      // ignore — happens if pty is already gone
    }
  }

  kill(id: TerminalId): void {
    const entry = this.entries.get(id)
    if (!entry) return
    try {
      entry.pty.kill()
    } catch {
      // ignore
    }
  }

  /**
   * Returns everything the PTY has emitted so far and cancels any pending flush.
   * Pending chunks are already captured in `buffer`, so dropping the next flush
   * prevents the renderer from receiving them twice once it subscribes.
   */
  attach(id: TerminalId): string {
    const entry = this.entries.get(id)
    if (!entry) return ''
    if (entry.flushTimer !== null) {
      clearTimeout(entry.flushTimer)
      entry.flushTimer = null
    }
    entry.pendingData = []
    return entry.buffer.join('')
  }

  disposeAll(): void {
    for (const entry of this.entries.values()) {
      try {
        entry.pty.kill()
      } catch {
        // ignore
      }
    }
    this.entries.clear()
  }

  private flush(entry: PtyEntry): void {
    if (entry.flushTimer !== null) {
      clearTimeout(entry.flushTimer)
      entry.flushTimer = null
    }
    if (entry.pendingData.length === 0) return
    const data = entry.pendingData.join('')
    entry.pendingData = []
    const payload: TerminalDataPayload = { id: entry.id, data }
    this.window?.webContents.send(IPC.terminals.data, payload)
  }
}
