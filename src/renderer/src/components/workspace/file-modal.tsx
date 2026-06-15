import { useCallback, useEffect, useRef } from 'react'
import { useWorkspace } from '@renderer/state/store'
import { FileTabs } from './file-tabs'
import { FileViewer } from './file-viewer'

interface Props {
  projectId: string
}

export function FileModal({ projectId }: Props) {
  const open = useWorkspace((s) => s.fileModalOpen)
  const close = useWorkspace((s) => s.closeFileModal)
  const width = useWorkspace((s) => s.fileModalWidth)
  const height = useWorkspace((s) => s.fileModalHeight)
  const setSize = useWorkspace((s) => s.setFileModalSize)
  const activeFileByProject = useWorkspace((s) => s.activeFileByProject)
  const activePath = activeFileByProject[projectId] ?? null
  const filename = activePath ? activePath.split('/').pop() ?? activePath : 'Untitled'

  const dragRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const onResizeDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      dragRef.current = { x: e.clientX, y: e.clientY, w: width, h: height }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [width, height]
  )
  const onResizeMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current
      if (!d) return
      setSize(d.w + (e.clientX - d.x) * 2, d.h + (e.clientY - d.y) * 2)
    },
    [setSize]
  )
  const onResizeUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[1px]"
      onClick={close}
    >
      <div
        className="relative flex flex-col rounded-lg border border-accent/20 bg-surface shadow-2xl overflow-hidden"
        style={{ width, height, maxWidth: '94vw', maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 h-9 px-3 border-b border-accent/14 bg-surface/80 flex-shrink-0">
          <span className="text-[12px] text-foreground/85 font-medium truncate flex-1">{filename}</span>
          <button
            type="button"
            onClick={close}
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
        <div className="h-9 border-b border-accent/14 flex-shrink-0">
          <FileTabs projectId={projectId} />
        </div>
        <div className="flex-1 min-h-0">
          <FileViewer projectId={projectId} />
        </div>
        <div
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
          role="separator"
          aria-label="Resize file window"
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
          style={{ touchAction: 'none' }}
        />
      </div>
    </div>
  )
}
