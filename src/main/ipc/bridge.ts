import { ipcMain, type BrowserWindow } from 'electron'
import { IPC, type BridgePairing, type BridgeStatus } from '@shared/types'
import type { MobileBridge } from '../bridge/server'

/**
 * Expose mobile-bridge status + pairing to the renderer, and push periodic
 * status updates so the Settings indicator reflects connected phones and
 * Tailscale reachability without the user re-opening the panel.
 */
export function registerBridgeIpc(bridge: MobileBridge, win: BrowserWindow): void {
  ipcMain.handle(IPC.bridge.getStatus, (): Promise<BridgeStatus> => bridge.getStatus())
  ipcMain.handle(IPC.bridge.getPairing, (): Promise<BridgePairing> => bridge.getPairing())
  ipcMain.handle(
    IPC.bridge.regeneratePairing,
    (): Promise<BridgePairing> => bridge.regeneratePairing()
  )

  const pushStatus = (): void => {
    void bridge.getStatus().then((status) => {
      if (!win.isDestroyed()) win.webContents.send(IPC.bridge.status, status)
    })
  }

  // Refresh roughly every 10s; cheap (a tailscale status probe + counts).
  const timer = setInterval(pushStatus, 10_000)
  win.on('closed', () => clearInterval(timer))
  // Prime once the renderer is ready to listen.
  win.webContents.once('did-finish-load', pushStatus)
}
