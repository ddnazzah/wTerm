import { useCallback, useEffect } from 'react'
import { useWorkspace } from '@renderer/state/store'
import { EditorShell } from './editor-shell'
import { ModalEditor } from './modal-editor'

interface Props {
  projectId: string
}

/** Renders the modal/fullscreen overlay surfaces. Docked mode is handled inline in app.tsx. */
export function EditorOverlay({ projectId }: Props) {
  const viewMode = useWorkspace((s) => s.editorViewMode)
  const openFiles = useWorkspace((s) => s.openFiles)
  const closeFile = useWorkspace((s) => s.closeFile)
  const exitFullscreen = useWorkspace((s) => s.exitFullscreen)

  const closeAll = useCallback(() => {
    for (const f of openFiles.filter((f) => f.projectId === projectId)) closeFile(f)
  }, [openFiles, projectId, closeFile])

  // In fullscreen, Escape returns to the prior mode (modal/dock) rather than
  // closing the file. The find-widget guard mirrors ModalEditor so Esc first
  // dismisses an open in-editor search.
  useEffect(() => {
    if (viewMode !== 'fullscreen') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (document.querySelector('.monaco-editor .find-widget.visible')) return
      e.preventDefault()
      exitFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewMode, exitFullscreen])

  if (viewMode === 'modal') return <ModalEditor projectId={projectId} onClose={closeAll} />
  if (viewMode === 'fullscreen') {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <EditorShell projectId={projectId} onClose={closeAll} />
      </div>
    )
  }
  return null
}
