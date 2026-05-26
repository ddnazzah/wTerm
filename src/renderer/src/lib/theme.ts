import { useSyncExternalStore } from 'react'

export type ThemeName = 'dark' | 'mint'

export const THEMES: ReadonlyArray<{ id: ThemeName; label: string }> = [
  { id: 'dark', label: 'Default' },
  { id: 'mint', label: 'Mint' },
]

const STORAGE_KEY = 'tw:theme'
const DEFAULT_THEME: ThemeName = 'dark'

function isThemeName(v: unknown): v is ThemeName {
  return v === 'dark' || v === 'mint'
}

function readStored(): ThemeName {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return isThemeName(raw) ? raw : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

function applyTheme(theme: ThemeName): void {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  // HeroUI uses Tailwind's `dark` class for color-scheme utilities; both themes are dark-mode.
  root.classList.add('dark')
}

const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

export function initTheme(): void {
  applyTheme(readStored())
}

export function setTheme(theme: ThemeName): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // ignore — storage may be unavailable
  }
  applyTheme(theme)
  emit()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useTheme(): {
  theme: ThemeName
  setTheme: (t: ThemeName) => void
} {
  const theme = useSyncExternalStore(
    subscribe,
    () => readStored(),
    () => DEFAULT_THEME
  )
  return { theme, setTheme }
}
