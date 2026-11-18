import { ipcMain, type BrowserWindow } from 'electron'
import { IPC, type AgentHooksStatus, type AutopilotSnapshot, type TerminalId } from '@shared/types'
import { AgentHookServer } from '../agent/hook-server'
import { hookStatus, installAgentHooks, refreshAgentHooks, removeAgentHooks } from '../agent/hook-install'
import { Autopilot } from '../autopilot/autopilot'
import { createClaudeRunner } from '../autopilot/supervisor'
import { readTranscript } from '../autopilot/transcript'
import type { PtyManager } from '../pty/manager'
import { getState, mutate } from '../store/state'

// Agent signals: the loopback listener plus the settings toggle behind it.
//
// The listener always runs — it costs one loopback socket and it has to be up
// before any agent fires a hook. What the user opts into is the *installation*:
// wTerm writing relay entries into ~/.claude/settings.json. Without that, the
// listener simply never hears anything and wTerm falls back to reading window
// titles, which is a guess rather than the agent's own word.

let server: AgentHookServer | null = null
let autopilot: Autopilot | null = null

/** Autopilot is on for new sessions unless the user has turned it off. */
function storedDefault(): boolean {
  return getState().autopilotDefaultOn ?? true
}

function createAutopilot(pty: PtyManager, getWindow: () => BrowserWindow | null): Autopilot {
  const send = (snapshot: AutopilotSnapshot): void => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(IPC.autopilot.changed, snapshot)
  }
  return new Autopilot(
    {
      decide: createClaudeRunner(),
      read: (path) => readTranscript(path),
      apply: (id, event) => pty.applyAgentEvent(id, event),
      changed: send,
    },
    storedDefault()
  )
}

export async function startAgentHooks(): Promise<void> {
  const pilot = autopilot
  if (!pilot) throw new Error('registerAgentIpc must run before startAgentHooks')
  const hookServer = new AgentHookServer()
  // Every event goes through Autopilot, which passes all but the Stops it is
  // deciding straight to the activity machine.
  hookServer.onMessage((message) => pilot.handle(message))
  await hookServer.start()
  server = hookServer

  // The relay path changes when wTerm is reinstalled elsewhere, and entries from
  // an older wTerm lack the Stop timeout Autopilot needs, so bring any existing
  // opt-in up to date. Both read as "not installed" to hookStatus, which is why
  // this keys off whether wTerm's entries are present at all.
  await refreshAgentHooks(hookServer.relayPath())
}

export async function stopAgentHooks(): Promise<void> {
  await server?.stop()
  server = null
}

async function currentStatus(): Promise<AgentHooksStatus> {
  if (!server) {
    return { installed: false, listening: false, settingsPath: '', error: null }
  }
  const status = await hookStatus(server.relayPath())
  return { ...status, listening: true }
}

export function registerAgentIpc(pty: PtyManager, getWindow: () => BrowserWindow | null): void {
  const pilot = createAutopilot(pty, getWindow)
  autopilot = pilot

  ipcMain.handle(IPC.agent.status, (): Promise<AgentHooksStatus> => currentStatus())

  ipcMain.handle(IPC.autopilot.snapshot, (_e, id: TerminalId): AutopilotSnapshot => pilot.snapshot(id))
  ipcMain.handle(IPC.autopilot.setEnabled, (_e, id: TerminalId, enabled: boolean): AutopilotSnapshot => {
    if (typeof id !== 'string' || typeof enabled !== 'boolean') throw new Error('invalid autopilot toggle')
    pilot.setEnabled(id, enabled)
    return pilot.snapshot(id)
  })
  ipcMain.handle(IPC.autopilot.getDefault, (): boolean => storedDefault())
  ipcMain.handle(IPC.autopilot.setDefault, (_e, enabled: boolean): boolean => {
    if (typeof enabled !== 'boolean') throw new Error('invalid autopilot default')
    mutate((draft) => {
      draft.autopilotDefaultOn = enabled
    })
    pilot.setDefault(enabled)
    return enabled
  })

  ipcMain.handle(IPC.agent.install, async (): Promise<AgentHooksStatus> => {
    if (!server) throw new Error('agent hook listener is not running')
    await installAgentHooks(server.relayPath())
    return currentStatus()
  })

  ipcMain.handle(IPC.agent.uninstall, async (): Promise<AgentHooksStatus> => {
    await removeAgentHooks()
    return currentStatus()
  })
}
