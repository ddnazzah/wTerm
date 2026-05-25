import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '@shared/types'

export function registerDialogIpc(): void {
  ipcMain.handle(IPC.dialog.pickFolder, async (e): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Add project',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0] ?? null
  })
}
