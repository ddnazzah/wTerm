import { app, BrowserWindow, ipcMain } from 'electron'
import electronUpdater from 'electron-updater'
import { IPC, type UpdateStatus } from '@shared/types'

// electron-updater ships as CommonJS; the named `autoUpdater` export isn't
// reliably picked up under ESM interop, so reach it through the default export.
const { autoUpdater } = electronUpdater

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // hourly

let win: BrowserWindow | null = null
let lastStatus: UpdateStatus = app.isPackaged ? { state: 'idle' } : { state: 'unsupported' }
/** Version from the most recent `update-available`, so progress/downloaded carry it. */
let pendingVersion = ''

export function setUpdaterWindow(w: BrowserWindow): void {
  win = w
}

/** True once an update has finished downloading and is staged to install. */
export function isUpdateReady(): boolean {
  return lastStatus.state === 'downloaded'
}

/**
 * Hand off to Squirrel (macOS) / the NSIS installer (Windows) to swap in the
 * downloaded version and relaunch. Caller must have already flushed state and
 * set the app's quitting guard so the `before-quit` handler steps aside.
 */
export function quitAndInstallUpdate(): void {
  autoUpdater.quitAndInstall()
}

function setStatus(status: UpdateStatus): void {
  lastStatus = status
  win?.webContents.send(IPC.update.status, status)
}

export function registerUpdater(): void {
  // Background download is the default for the "auto-download + notify" UX; the
  // renderer surfaces a banner once the download finishes.
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => {
    pendingVersion = info.version
    setStatus({ state: 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', (info) =>
    setStatus({ state: 'not-available', version: info.version })
  )
  autoUpdater.on('download-progress', (p) =>
    setStatus({ state: 'downloading', percent: Math.round(p.percent), version: pendingVersion })
  )
  autoUpdater.on('update-downloaded', (info) => {
    pendingVersion = info.version
    setStatus({ state: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (err) =>
    setStatus({ state: 'error', message: err?.message ?? String(err) })
  )

  ipcMain.handle(IPC.update.getStatus, (): UpdateStatus => lastStatus)

  ipcMain.handle(IPC.update.check, async (): Promise<void> => {
    if (!app.isPackaged) {
      setStatus({ state: 'unsupported' })
      return
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      // checkForUpdates rejects on network/feed errors; the 'error' event has
      // already pushed a status, so nothing more to do here.
    }
  })

  ipcMain.handle(IPC.update.install, (): void => {
    if (lastStatus.state !== 'downloaded') return
    // Trigger a normal quit; the app's `before-quit` handler flushes state,
    // sees an update is ready, and hands off to quitAndInstall. Routing through
    // one path keeps the explicit-restart and quit-later cases identical.
    app.quit()
  })
}

/** Kick off the first check (and the hourly cadence) once the window is up. */
export function startUpdateChecks(): void {
  if (!app.isPackaged) return
  void autoUpdater.checkForUpdates().catch(() => {})
  setInterval(() => void autoUpdater.checkForUpdates().catch(() => {}), CHECK_INTERVAL_MS)
}
