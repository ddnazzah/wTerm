export type ThemeName = 'halcyon'

// Single-theme app. Halcyon is the only theme; there is no switching/persistence.
const THEME: ThemeName = 'halcyon'

function applyTheme(): void {
  const root = document.documentElement
  root.setAttribute('data-theme', THEME)
  // HeroUI uses Tailwind's `dark` class for color-scheme utilities.
  root.classList.add('dark')
}

export function initTheme(): void {
  applyTheme()
}

// Kept as a hook so existing call sites that read `theme` for xterm / CodeMirror
// theming keep working unchanged.
export function useTheme(): { theme: ThemeName } {
  return { theme: THEME }
}
