// Renderer-side platform detection + keyboard-hint formatting. The actual
// keybindings accept ⌘ or Ctrl interchangeably (see app.tsx), so this only
// affects the labels we display and a few platform-specific layout tweaks for
// the Windows window-controls overlay.

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''

export const isMac = /Mac/i.test(ua)
export const isWindows = /Win/i.test(ua)

/**
 * Format a keyboard shortcut for display. macOS uses the ⌘ / ⇧ glyphs; every
 * other platform uses the spelled-out `Ctrl+` / `Shift+` form.
 *   kbd('T')                 → "⌘T"      / "Ctrl+T"
 *   kbd('F', { shift: true }) → "⌘⇧F"    / "Ctrl+Shift+F"
 */
export function kbd(key: string, opts?: { shift?: boolean }): string {
  const shift = opts?.shift ?? false
  if (isMac) return `⌘${shift ? '⇧' : ''}${key}`
  return `Ctrl+${shift ? 'Shift+' : ''}${key}`
}
