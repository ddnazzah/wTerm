import { useWorkspace } from '@renderer/state/store'
import { EditorChrome } from './editor-chrome'
import { FileTabs } from './file-tabs'
import { FileViewer } from './file-viewer'

interface Props {
  projectId: string
  onClose: () => void
}

export function EditorShell({ projectId, onClose }: Props) {
  const activeFileByProject = useWorkspace((s) => s.activeFileByProject)
  const activePath = activeFileByProject[projectId] ?? null
  const filename = activePath ? activePath.split('/').pop() ?? activePath : 'Untitled'
  return (
    <div
      data-editor-surface
      className="flex flex-col h-full w-full min-h-0 bg-surface overflow-hidden"
    >
      <EditorChrome filename={filename} onClose={onClose} />
      <div className="h-9 border-b border-accent/14 flex-shrink-0">
        <FileTabs projectId={projectId} />
      </div>
      <div className="flex-1 min-h-0">
        <FileViewer projectId={projectId} />
      </div>
    </div>
  )
}
