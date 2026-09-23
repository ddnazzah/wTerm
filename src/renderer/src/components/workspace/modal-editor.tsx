import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useWorkspace } from '@renderer/state/store'
import { modalBoxIn, type Box } from '@renderer/lib/modal-size'
import { EditorShell } from './editor-shell'

interface Props {
  projectId: string
  onClose: () => void
}

/** The workspace's content area — see `data-editor-host` in app.tsx. */
const HOST_SELECTOR = '[data-editor-host]'

/**
 * Track the content area's box.
 *
 * The floating editor lives inside the workspace, never over the sidebars or
 * the activity bar, so it has to follow that region as panels open, close and
 * are dragged. Measured in a layout effect so the first paint is already in the
 * right place.
 */
function useHostBox(): Box | null {
  const [box, setBox] = useState<Box | null>(null)

  useLayoutEffect(() => {
    const host = document.querySelector(HOST_SELECTOR)
    if (!host) return

    const measure = (): void => {
      const r = host.getBoundingClientRect()
      setBox({ left: r.left, top: r.top, width: r.width, height: r.height })
    }
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(host)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  return box
}

export function ModalEditor({ projectId, onClose }: Props) {
  const width = useWorkspace((s) => s.fileModalWidth)
  const height = useWorkspace((s) => s.fileModalHeight)
  const setSize = useWorkspace((s) => s.setFileModalSize)
  const dragRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const host = useHostBox()

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (document.querySelector('.monaco-editor .find-widget.visible')) return
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
      // The card is centred, so it grows from both edges at once.
      setSize(d.w + (e.clientX - d.x) * 2, d.h + (e.clientY - d.y) * 2)
    },
    [setSize]
  )
  const onResizeUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  // Nothing until the host is measured: a viewport-sized overlay, even for one
  // frame, is exactly the thing that made the surrounding buttons unclickable.
  if (!host) return null
  const box = modalBoxIn(host, { width, height })

  return (
    <div
      // Confined to the content area, so the scrim dims the workspace and
      // leaves the sidebars, activity bar and status bar live.
      className="fixed z-50 bg-black/55 backdrop-blur-[1px]"
      style={{ left: host.left, top: host.top, width: host.width, height: host.height }}
      onClick={onClose}
    >
      <div
        className="absolute flex flex-col rounded-lg border border-accent/20 shadow-2xl overflow-hidden"
        style={{
          left: box.left - host.left,
          top: box.top - host.top,
          width: box.width,
          height: box.height,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <EditorShell projectId={projectId} onClose={onClose} />
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
