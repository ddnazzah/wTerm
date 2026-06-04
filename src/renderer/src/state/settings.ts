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

export interface TerminalSettings {
  /**
   * Command (or multi-line script) run automatically in every new terminal tab.
   * Empty string = nothing runs (the default).
   */
  startupCommand: string
}

export const TERMINAL_DEFAULTS: TerminalSettings = {
  startupCommand: '',
}

const STORAGE_KEY = 'tw:editor-settings'
const TERMINAL_STORAGE_KEY = 'tw:terminal-settings'

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

function readStoredTerminal(): TerminalSettings {
  try {
    const raw = localStorage.getItem(TERMINAL_STORAGE_KEY)
    if (!raw) return TERMINAL_DEFAULTS
    const parsed = JSON.parse(raw) as Partial<TerminalSettings>
    return { ...TERMINAL_DEFAULTS, ...parsed }
  } catch {
    return TERMINAL_DEFAULTS
  }
}

function persistTerminal(s: TerminalSettings): void {
  try {
    localStorage.setItem(TERMINAL_STORAGE_KEY, JSON.stringify(s))
  } catch {
    // ignore
  }
}

interface SettingsState {
  editor: EditorSettings
  terminal: TerminalSettings
  updateEditor: (patch: Partial<EditorSettings>) => void
  resetEditor: () => void
  updateTerminal: (patch: Partial<TerminalSettings>) => void
}

export const useSettings = create<SettingsState>((set) => ({
  editor: readStored(),
  terminal: readStoredTerminal(),
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
  updateTerminal: (patch) =>
    set((state) => {
      const next = { ...state.terminal, ...patch }
      persistTerminal(next)
      return { terminal: next }
    }),
}))
