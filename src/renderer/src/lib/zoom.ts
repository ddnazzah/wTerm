import { useEffect } from 'react'

const ZOOM_KEY = 'tw:zoom-factor'
const MIN = 0.5
const MAX = 2.5
const STEP = 0.1

function clamp(n: number): number {
  return Math.min(MAX, Math.max(MIN, n))
}

function readStored(): number {
  const n = Number.parseFloat(localStorage.getItem(ZOOM_KEY) ?? '')
  return Number.isFinite(n) ? clamp(n) : 1
}

function apply(factor: number): void {
  const clamped = clamp(factor)
  localStorage.setItem(ZOOM_KEY, String(clamped))
  void window.api.system.setZoom(clamped)
}

/**
 * Whole-window zoom, mirroring browser zoom. Restores the persisted factor on
 * mount and binds Cmd/Ctrl + =, -, 0 to zoom in, out, and reset. The factor is
 * persisted in localStorage; the main process clamps and applies it to the
 * window's webContents (zoom is otherwise reset on every renderer reload).
 */
export function useWindowZoom(): void {
  useEffect(() => {
    apply(readStored())

    const onKey = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod || e.altKey) return
      // `=`/`+` zoom in, `-`/`_` zoom out, `0` reset. Both the bare and shifted
      // glyphs are accepted so the shortcuts work without pressing Shift.
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        apply(readStored() + STEP)
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        apply(readStored() - STEP)
      } else if (e.key === '0') {
        e.preventDefault()
        apply(1)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
