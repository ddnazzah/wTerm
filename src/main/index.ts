import { app, BrowserWindow, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { registerProjectIpc } from './ipc/project'
import { registerTerminalIpc } from './ipc/terminal'
import { registerSystemIpc, setMainWindow } from './ipc/system'
import { registerDialogIpc } from './ipc/dialog'
import { loadState, saveStateNow } from './store/state'
import { PtyManager } from './pty/manager'

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
const ptyManager = new PtyManager()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0b0b0f',
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
