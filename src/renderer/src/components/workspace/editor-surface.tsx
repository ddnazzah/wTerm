import { useCallback } from 'react'
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

  const closeAll = useCallback(() => {
    for (const f of openFiles.filter((f) => f.projectId === projectId)) closeFile(f)
  }, [openFiles, projectId, closeFile])

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
