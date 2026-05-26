import { useCallback, useEffect, useMemo } from 'react'
import { tabKey, useWorkspace, type OpenedFile } from '@renderer/state/store'
import { useSettings } from '@renderer/state/settings'
import { formattableParser, formatText } from '@renderer/lib/formatter'
import { CodeEditor } from './code-editor'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp'])

interface Props {
  projectId: string
}

export function FileViewer({ projectId }: Props) {
  const openFiles = useWorkspace((s) => s.openFiles)
  const fileStates = useWorkspace((s) => s.fileStates)
  const activeFileByProject = useWorkspace((s) => s.activeFileByProject)
  const setFileState = useWorkspace((s) => s.setFileState)
  const setFileContent = useWorkspace((s) => s.setFileContent)
  const markFileSaved = useWorkspace((s) => s.markFileSaved)

  const projectTabs = useMemo(
    () => openFiles.filter((f) => f.projectId === projectId),
    [openFiles, projectId]
  )
  const activePath = activeFileByProject[projectId] ?? null
  const activeFile: OpenedFile | null =
    (activePath && projectTabs.find((f) => f.path === activePath)) || null

  // Load content for any tab still in 'loading' state.
  useEffect(() => {
    for (const file of projectTabs) {
      const state = fileStates[tabKey(file)]
      if (state?.kind !== 'loading') continue
      const ext = extOf(file.path)
      if (IMAGE_EXTS.has(ext)) {
        setFileState(file, { kind: 'binary' })
        continue
      }
      void window.api.fs
        .readText(file.projectId, file.path)
        .then((text) => {
          if (text === null) setFileState(file, { kind: 'binary' })
          else setFileState(file, { kind: 'text', current: text, saved: text })
        })
        .catch((err: unknown) => {
          setFileState(file, {
            kind: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
        })
    }
  }, [projectTabs, fileStates, setFileState])

  const save = useCallback(
    async (file: OpenedFile, text: string) => {
      const ok = await window.api.fs.writeText(file.projectId, file.path, text)
      if (ok) markFileSaved(file, text)
    },
    [markFileSaved]
  )

  if (projectTabs.length === 0) return null

  return (
    <div className="flex flex-col h-full w-full bg-background min-w-0">
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeFile ? (
          <EditorPane file={activeFile} onSave={save} onChange={setFileContent} />
        ) : (
          <div className="text-[12px] text-foreground/40 p-4">No file selected.</div>
        )}
      </div>
    </div>
  )
}

function EditorPane({
  file,
  onSave,
  onChange,
}: {
  file: OpenedFile
  onSave: (file: OpenedFile, text: string) => Promise<void>
  onChange: (file: OpenedFile, content: string) => void
}) {
  const state = useWorkspace((s) => s.fileStates[tabKey(file)])
  const editorSettings = useSettings((s) => s.editor)

  if (!state || state.kind === 'loading') {
    return <div className="text-[12px] text-foreground/45 p-4">Loading…</div>
  }
  if (state.kind === 'binary') {
    return (
      <Placeholder
        title="Binary or large file"
        hint="This file is over 512 KB or not text. Use “Open externally” from the tree to view it."
      />
    )
  }
  if (state.kind === 'error') {
    return <Placeholder title="Couldn’t open file" hint={state.message} />
  }

  const name = file.path.split('/').pop() ?? file.path
  const formattable = formattableParser(name) !== null

  const format = formattable
    ? async (text: string) => {
        try {
          return await formatText(text, name, {
            tabWidth: editorSettings.tabSize,
            useTabs: !editorSettings.insertSpaces,
          })
        } catch (err) {
          console.warn('[format] failed:', err)
          return null
        }
      }
    : undefined

  return (
    <CodeEditor
      fileKey={tabKey(file)}
      filename={name}
      initialContent={state.current}
      onChange={(text) => onChange(file, text)}
      onSave={(text) => void onSave(file, text)}
      format={format}
    />
  )
}

function Placeholder({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="text-[13px] text-foreground/70">{title}</div>
      {hint && <div className="text-[11px] text-foreground/45 max-w-md">{hint}</div>}
    </div>
  )
}

function extOf(p: string): string {
  const name = p.split('/').pop() ?? p
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i + 1).toLowerCase()
}
