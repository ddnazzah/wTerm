import type { BrowserWindow } from 'electron'
import { IPC } from '@shared/types'
import { getState } from './store/state'

/**
 * Bridge-originated mutations need to be reflected on the desktop UI, which
 * otherwise only learns about state from its own optimistic updates. We keep a
 * reference to the main window and push the full {@link getState} snapshot after
 * any mutation the phone initiated. Desktop-originated IPC mutations do NOT call
 * this (the renderer already updated its mirror), avoiding a feedback loop.
 */
let win: BrowserWindow | null = null

export function setSyncWindow(w: BrowserWindow): void {
  win = w
  w.on('closed', () => {
    if (win === w) win = null
  })
}

/** Push the current full state to the desktop renderer. */
export function broadcastState(): void {
  win?.webContents.send(IPC.state.changed, getState())
}

/**
 * Run a mutation that originated from the mobile bridge, then broadcast the new
 * state to the desktop renderer so its Zustand mirror reconciles. Returns the
 * mutation's result.
 */
export function applyFromBridge<T>(fn: () => T): T {
  const result = fn()
  broadcastState()
  return result
}
