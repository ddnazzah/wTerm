import { create } from 'zustand'

export interface EditorSettings {
  fontSize: number
  fontFamily: string
  tabSize: number
  insertSpaces: boolean
  wordWrap: boolean
  lineNumbers: boolean
  /** Run prettier on save when supported. */
  formatOnSave: boolean
}

export const DEFAULTS: EditorSettings = {
  fontSize: 13,
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  tabSize: 2,
  insertSpaces: true,
  wordWrap: false,
  lineNumbers: true,
  formatOnSave: false,
}

const STORAGE_KEY = 'tw:editor-settings'

function readStored(): EditorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<EditorSettings>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return DEFAULTS
  }
}

function persist(s: EditorSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // ignore
  }
}

interface SettingsState {
  editor: EditorSettings
  updateEditor: (patch: Partial<EditorSettings>) => void
  resetEditor: () => void
}

export const useSettings = create<SettingsState>((set) => ({
  editor: readStored(),
  updateEditor: (patch) =>
    set((state) => {
      const next = { ...state.editor, ...patch }
      persist(next)
      return { editor: next }
    }),
  resetEditor: () =>
    set(() => {
      persist(DEFAULTS)
      return { editor: { ...DEFAULTS } }
    }),
}))
