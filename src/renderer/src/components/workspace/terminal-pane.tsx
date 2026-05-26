import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useWorkspace } from '@renderer/state/store'
import { useTheme } from '@renderer/lib/theme'

// POSIX single-quote shell escape — works for paths with spaces, ampersands,
// parentheses, etc. Embedded single quotes are bridged with `'\''`.
const shellQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/heic': 'heic',
}

const extForBlob = (b: { type: string; name?: string }): string => {
  const m = MIME_TO_EXT[b.type]
  if (m) return m
  const name = b.name
  if (name) {
    const dot = name.lastIndexOf('.')
    if (dot > 0 && dot < name.length - 1) return name.slice(dot + 1).toLowerCase()
  }
  return 'bin'
}

interface Props {
  terminalId: string
  active: boolean
  onBell?: () => void
}

// Parse `OSC 9 ; 4 ; <state> ; <progress> ST`. States: 0=clear, 1=normal,
// 2=error, 3=indeterminate, 4=paused. We treat 1/3/4 as busy, 0/2 as idle.
const parseConEmuProgress = (data: string): boolean | null => {
  if (!data.startsWith('4;')) return null
  const stateChar = data.charAt(2)
  if (stateChar === '0' || stateChar === '2') return false
  if (stateChar === '1' || stateChar === '3' || stateChar === '4') return true
  return null
}

// xterm.js takes a JS object (not CSS), so we resolve the theme-aware tokens
// from `:root` at runtime. The other ANSI slots are theme-agnostic.
const readVar = (name: string, fallback: string): string => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

const buildXtermTheme = () => ({
  background: readVar('--background', '#0b0b0f'),
  foreground: readVar('--foreground', '#e5e7eb'),
  cursor: '#a78bfa',
  cursorAccent: readVar('--background', '#0b0b0f'),
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
})

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
      theme: buildXtermTheme(),
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

    // Replay any output the PTY already produced before we mounted (initial
    // shell prompt, etc.) BEFORE attaching the live listener. attach() also
    // clears pending un-flushed chunks on the main side so they don't arrive
    // twice once the listener is up.
    let detached = false
    let offData: (() => void) | null = null
    void window.api.terminals.attach(terminalId).then((snapshot) => {
      if (detached) return
      if (snapshot) term.write(snapshot)
      offData = window.api.terminals.onData(({ id, data }) => {
        if (id === terminalId) term.write(data)
      })
    })

    const writeDisposable = term.onData((data) => {
      void window.api.terminals.write(terminalId, data)
    })

    const bellDisposable = term.onBell(() => {
      bellRef.current?.()
    })

    const setTitle = useWorkspace.getState().setTerminalTitle
    const titleDisposable = term.onTitleChange((title) => {
      setTitle(terminalId, title)
    })

    const setBusy = (busy: boolean): void => {
      useWorkspace.getState().setTerminalBusy(terminalId, busy)
    }

    // OSC 133 — FinalTerm semantic prompts (shell integration).
    //   A = prompt start, B = command start (input), C = command output begins,
    //   D = command finished. Busy spans C..D.
    const osc133Disposable = term.parser.registerOscHandler(133, (data) => {
      const kind = data.charAt(0)
      if (kind === 'C') setBusy(true)
      else if (kind === 'A' || kind === 'B' || kind === 'D') setBusy(false)
      return false
    })

    // OSC 9 — iTerm2/ConEmu. Subtype `9;4;<state>` is ConEmu progress.
    // Other `9` subtypes (iTerm2 notifications) we let fall through.
    const osc9Disposable = term.parser.registerOscHandler(9, (data) => {
      const busy = parseConEmuProgress(data)
      if (busy !== null) setBusy(busy)
      return false
    })

    return () => {
      detached = true
      offData?.()
      writeDisposable.dispose()
      bellDisposable.dispose()
      titleDisposable.dispose()
      osc133Disposable.dispose()
      osc9Disposable.dispose()
      ro.disconnect()
      window.removeEventListener('resize', onResize)
      useWorkspace.getState().setTerminalBusy(terminalId, false)
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

  const { theme } = useTheme()
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = buildXtermTheme()
  }, [theme])

  const busy = useWorkspace((s) => !!s.busyByTerminal[terminalId])
  const [dragOver, setDragOver] = useState(false)
  const dragDepthRef = useRef(0)

  const insertPaths = useCallback(
    (paths: string[]): void => {
      if (paths.length === 0) return
      const insert = paths.map(shellQuote).join(' ') + ' '
      void window.api.terminals.write(terminalId, insert)
      termRef.current?.focus()
    },
    [terminalId]
  )

  const savePastedFile = useCallback(
    async (file: File): Promise<string | null> => {
      const buf = new Uint8Array(await file.arrayBuffer())
      return window.api.fs.saveTempPaste(buf, extForBlob(file))
    },
    []
  )

  const onDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault()
    dragDepthRef.current += 1
    setDragOver(true)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragOver(false)
  }, [])

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      if (!Array.from(e.dataTransfer.types).includes('Files')) return
      e.preventDefault()
      dragDepthRef.current = 0
      setDragOver(false)
      const files = Array.from(e.dataTransfer.files)
      if (files.length === 0) return
      const paths: string[] = []
      for (const file of files) {
        // For files dragged from the OS this resolves to the real absolute
        // path. In-memory drops (e.g. drag-from-browser) return '' — fall back
        // to writing the bytes into our temp directory so the path is real.
        const native = window.api.fs.pathForFile(file)
        if (native) {
          paths.push(native)
        } else {
          const saved = await savePastedFile(file)
          if (saved) paths.push(saved)
        }
      }
      insertPaths(paths)
    },
    [insertPaths, savePastedFile]
  )

  const onPaste = useCallback(
    async (e: React.ClipboardEvent<HTMLDivElement>) => {
      const data = e.clipboardData
      // Collect image/file items. Plain text and rich-text pastes are left
      // alone so xterm's clipboard handling continues to work normally.
      const fileItems: File[] = []
      for (const item of Array.from(data.items)) {
        if (item.kind === 'file') {
          const f = item.getAsFile()
          if (f) fileItems.push(f)
        }
      }
      if (fileItems.length === 0) return
      e.preventDefault()
      const paths: string[] = []
      for (const file of fileItems) {
        const native = window.api.fs.pathForFile(file)
        if (native) {
          paths.push(native)
        } else {
          const saved = await savePastedFile(file)
          if (saved) paths.push(saved)
        }
      }
      insertPaths(paths)
    },
    [insertPaths, savePastedFile]
  )

  return (
    <div
      className="absolute inset-0"
      style={{ visibility: active ? 'visible' : 'hidden' }}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        void onDrop(e)
      }}
      onPaste={(e) => {
        void onPaste(e)
      }}
    >
      <div className="terminal-host h-full w-full" ref={hostRef} />
      {busy && (
        <div
          className="terminal-progress pointer-events-none absolute inset-x-0 top-0 h-[2px] overflow-hidden"
          aria-hidden
        >
          <div className="terminal-progress-bar h-full w-1/3 bg-accent" />
        </div>
      )}
      {dragOver && (
        <div
          className="pointer-events-none absolute inset-2 rounded-lg border-2 border-dashed border-accent/70 bg-accent/10 flex items-center justify-center"
          aria-hidden
        >
          <div className="text-sm text-foreground/80 bg-background/80 px-3 py-1.5 rounded-md border border-accent/30">
            Drop to insert file path
          </div>
        </div>
      )}
    </div>
  )
}
