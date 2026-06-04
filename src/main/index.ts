import { app, BrowserWindow, nativeImage, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { registerProjectIpc } from './ipc/project'
import { registerTerminalIpc } from './ipc/terminal'
import { registerSystemIpc, setMainWindow } from './ipc/system'
import { registerDialogIpc } from './ipc/dialog'
import { registerFsIpc } from './ipc/fs'
import { registerGitIpc } from './ipc/git'
import { registerGitHubIpc } from './ipc/github'
import { loadState, saveStateNow } from './store/state'
import { PtyManager } from './pty/manager'

const __dirname = dirname(fileURLToPath(import.meta.url))

app.setName('wTerm')

// Windows attributes notifications (and taskbar grouping) by AppUserModelID. It
// must match the NSIS installer's appId or toasts are silently dropped / shown
// as "electron.exe". No-op / unnecessary on macOS.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.ddnazzah.wterm')
}

// Resolve the app icon in both dev (cwd = repo root) and packaged builds
// (where Resources/icon.png is staged by electron-builder from buildResources).
function resolveAppIcon(): string | undefined {
  const candidates = [
    join(__dirname, '../../resources/icon.png'),
    join(process.resourcesPath ?? '', 'icon.png'),
    join(process.cwd(), 'resources/icon.png'),
  ]
  return candidates.find((p) => p && existsSync(p))
}

const APP_ICON_PATH = resolveAppIcon()
if (APP_ICON_PATH && process.platform === 'darwin') {
  // Sets the dock icon in dev (packaged builds use the .icns inside the bundle).
  app.dock?.setIcon(nativeImage.createFromPath(APP_ICON_PATH))
}

let mainWindow: BrowserWindow | null = null
const ptyManager = new PtyManager()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    show: false,
    // macOS: inset traffic lights over the custom title bar. Windows/Linux have
    // no traffic lights, so we hide the native frame and draw the OS window
    // controls (minimize/maximize/close) as an overlay sized to our 44px header.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform !== 'darwin'
      ? {
          titleBarOverlay: {
            color: '#0b0b0f',
            symbolColor: '#e5e7eb',
            height: 44,
          },
        }
      : {}),
    backgroundColor: '#0b0b0f',
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  ptyManager.attachWindow(mainWindow)
  setMainWindow(mainWindow)

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  await loadState()
  registerProjectIpc()
  registerTerminalIpc(ptyManager)
  registerSystemIpc()
  registerDialogIpc()
  registerFsIpc()
  registerGitIpc()
  registerGitHubIpc()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let isQuitting = false
app.on('before-quit', (e) => {
  if (isQuitting) return
  e.preventDefault()
  isQuitting = true
  ptyManager.disposeAll()
  saveStateNow()
    .catch((err) => console.error('[quit] state save failed', err))
    .finally(() => app.exit(0))
})
