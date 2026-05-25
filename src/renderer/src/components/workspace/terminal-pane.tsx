import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'

interface Props {
  terminalId: string
  active: boolean
  onBell?: () => void
}

const XTERM_THEME = {
  background: '#0b0b0f',
  foreground: '#e5e7eb',
  cursor: '#a78bfa',
  cursorAccent: '#0b0b0f',
  selectionBackground: 'rgba(167,139,250,0.35)',
  black: '#1f2937',
  red: '#ef4444',
  green: '#10b981',
  yellow: '#f59e0b',
  blue: '#3b82f6',
  magenta: '#ec4899',
  cyan: '#06b6d4',
  white: '#e5e7eb',
  brightBlack: '#374151',
  brightRed: '#f87171',
  brightGreen: '#34d399',
  brightYellow: '#fbbf24',
  brightBlue: '#60a5fa',
  brightMagenta: '#f472b6',
  brightCyan: '#22d3ee',
  brightWhite: '#f9fafb',
}

export function TerminalPane({ terminalId, active, onBell }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const initRef = useRef(false)
  const bellRef = useRef<typeof onBell>(onBell)
  bellRef.current = onBell

  useEffect(() => {
    if (!hostRef.current || initRef.current) return
    initRef.current = true

    const term = new Terminal({
      fontFamily:
        '"MesloLGS NF", "MesloLGS Nerd Font", "JetBrainsMono Nerd Font", "Hack Nerd Font", "Symbols Nerd Font", "Fira Code", Menlo, Monaco, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowTransparency: true,
      allowProposedApi: true,
      scrollback: 10_000,
      theme: XTERM_THEME,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())

    term.open(hostRef.current)
    termRef.current = term
    fitRef.current = fit

    const fitNow = (): void => {
      try {
        fit.fit()
        const { cols, rows } = term
        void window.api.terminals.resize(terminalId, cols, rows)
      } catch {
        // ignore — happens during teardown
      }
    }
    fitNow()

    const onResize = (): void => fitNow()
    window.addEventListener('resize', onResize)

    const ro = new ResizeObserver(() => fitNow())
    ro.observe(hostRef.current)

    const offData = window.api.terminals.onData(({ id, data }) => {
      if (id === terminalId) term.write(data)
    })

    const writeDisposable = term.onData((data) => {
      void window.api.terminals.write(terminalId, data)
    })

    const bellDisposable = term.onBell(() => {
      bellRef.current?.()
    })

    return () => {
      offData()
      writeDisposable.dispose()
      bellDisposable.dispose()
      ro.disconnect()
      window.removeEventListener('resize', onResize)
      term.dispose()
      termRef.current = null
      fitRef.current = null
      initRef.current = false
    }
  }, [terminalId])

  useEffect(() => {
    if (!active) return
    requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
        termRef.current?.focus()
        const term = termRef.current
        if (term) void window.api.terminals.resize(terminalId, term.cols, term.rows)
      } catch {
        // ignore
      }
    })
  }, [active, terminalId])

  return (
    <div
      className="terminal-host absolute inset-0"
      style={{ visibility: active ? 'visible' : 'hidden' }}
      ref={hostRef}
    />
  )
}
