import { useCallback, useRef, type ReactNode } from 'react'
import { useWorkspace } from '@renderer/state/store'
import { EditorShell } from './editor-shell'

interface Props {
  projectId: string
  onClose: () => void
  children: ReactNode
}

export function DockedEditor({ projectId, onClose, children }: Props) {
  const ratio = useWorkspace((s) => s.dockSplitRatio)
  const setRatio = useWorkspace((s) => s.setDockSplitRatio)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)

  const onDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])
  const onMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !hostRef.current) return
    const rect = hostRef.current.getBoundingClientRect()
    setRatio((e.clientY - rect.top) / rect.height)
  }, [setRatio])
  const onUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  return (
    <div ref={hostRef} className="flex flex-col h-full min-h-0">
      <div style={{ flexBasis: `${ratio * 100}%` }} className="min-h-0 overflow-hidden">
        <EditorShell projectId={projectId} onClose={onClose} />
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="h-1 cursor-row-resize bg-accent/10 hover:bg-accent/30 transition-colors flex-shrink-0"
        style={{ touchAction: 'none' }}
      />
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}
