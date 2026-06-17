import type { ReactNode } from 'react'
import { useWorkspace, type EditorViewMode } from '@renderer/state/store'

interface Props {
  filename: string
  onClose: () => void
}

const MODES: { mode: EditorViewMode; label: string; title: string; icon: ReactNode }[] = [
  {
    mode: 'docked',
    label: 'Dock',
    title: 'Dock — split above the terminal',
    // Panel split: frame with a filled bottom band.
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="1.5" />
        <path d="M3 14h18" />
        <path d="M3 17h18" strokeWidth="3" opacity="0.5" />
      </>
    ),
  },
  {
    mode: 'modal',
    label: 'Float',
    title: 'Floating window',
    // Floating window: smaller frame with a title bar.
    icon: (
      <>
        <rect x="5" y="6" width="14" height="12" rx="1.5" />
        <path d="M5 9.5h14" />
      </>
    ),
  },
  {
    mode: 'fullscreen',
    label: 'Full',
    title: 'Fullscreen',
    // Maximize: four outward corners.
    icon: <path d="M8 4H4v4 M16 4h4v4 M8 20H4v-4 M16 20h4v-4" />,
  },
]

export function EditorChrome({ filename, onClose }: Props) {
  const viewMode = useWorkspace((s) => s.editorViewMode)
  const setViewMode = useWorkspace((s) => s.setEditorViewMode)
  return (
    <div className="flex items-center gap-2 h-9 px-3 border-b border-accent/14 bg-surface/80 flex-shrink-0">
      <span className="text-[12px] text-foreground/85 font-medium truncate flex-1">{filename}</span>
      <div className="flex items-center gap-0.5 rounded-md bg-foreground/5 p-0.5">
        {MODES.map(({ mode, label, title, icon }) => (
          <button
            key={mode}
            type="button"
            title={title}
            aria-pressed={viewMode === mode}
            onClick={() => setViewMode(mode)}
            className={[
              'flex items-center gap-1 h-6 px-2 rounded text-[11px] font-medium transition-colors',
              viewMode === mode
                ? 'bg-accent text-accent-foreground'
                : 'text-foreground/60 hover:text-foreground hover:bg-foreground/10',
            ].join(' ')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {icon}
            </svg>
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close file"
        title="Close (Esc)"
        className="flex items-center justify-center w-6 h-6 rounded-md text-foreground/55 hover:text-foreground hover:bg-foreground/10 transition-colors"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}
