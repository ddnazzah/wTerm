import type { ReactNode } from 'react'
import { useWorkspace, type EditorViewMode } from '@renderer/state/store'

interface Props {
  filename: string
  onClose: () => void
}

const MODES: { mode: EditorViewMode; title: string; icon: ReactNode }[] = [
  {
    mode: 'docked',
    title: 'Dock (split with terminal)',
    icon: <path d="M3 4h18v16H3z M3 13h18" />,
  },
  {
    mode: 'modal',
    title: 'Floating window',
    icon: <path d="M5 6h14v12H5z" />,
  },
  {
    mode: 'fullscreen',
    title: 'Fullscreen',
    icon: <path d="M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5" />,
  },
]

export function EditorChrome({ filename, onClose }: Props) {
  const viewMode = useWorkspace((s) => s.editorViewMode)
  const setViewMode = useWorkspace((s) => s.setEditorViewMode)
  return (
    <div className="flex items-center gap-2 h-9 px-3 border-b border-accent/14 bg-surface/80 flex-shrink-0">
      <span className="text-[12px] text-foreground/85 font-medium truncate flex-1">{filename}</span>
      {MODES.map(({ mode, title, icon }) => (
        <button
          key={mode}
          type="button"
          title={title}
          aria-pressed={viewMode === mode}
          onClick={() => setViewMode(mode)}
          className={[
            'flex items-center justify-center w-6 h-6 rounded-md transition-colors',
            viewMode === mode
              ? 'bg-foreground/10 text-foreground'
              : 'text-foreground/55 hover:text-foreground hover:bg-foreground/10',
          ].join(' ')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {icon}
          </svg>
        </button>
      ))}
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
