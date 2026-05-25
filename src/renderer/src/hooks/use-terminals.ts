import { useCallback } from 'react'
import { useWorkspace } from '@renderer/state/store'
import type { Project } from '@shared/types'

export function useTerminals(project: Project | null) {
  const addTerminal = useWorkspace((s) => s.addTerminal)
  const removeTerminalLocal = useWorkspace((s) => s.removeTerminalLocal)
  const renameTerminalLocal = useWorkspace((s) => s.renameTerminalLocal)
  const setActiveTerminal = useWorkspace((s) => s.setActiveTerminal)
  const activeId = useWorkspace((s) =>
    project ? s.activeTerminalByProject[project.id] ?? null : null
  )

  const create = useCallback(async () => {
    if (!project) return null
    const record = await window.api.terminals.create({ projectId: project.id })
    if (record) addTerminal(project.id, record)
    return record
  }, [project, addTerminal])

  const close = useCallback(
    async (terminalId: string) => {
      if (!project) return
      await window.api.terminals.kill(terminalId)
      window.api.terminals.removeRecord(project.id, terminalId)
      removeTerminalLocal(project.id, terminalId)
    },
    [project, removeTerminalLocal]
  )

  const rename = useCallback(
    async (terminalId: string, name: string) => {
      if (!project) return
      renameTerminalLocal(project.id, terminalId, name)
      await window.api.terminals.rename(project.id, terminalId, name)
    },
    [project, renameTerminalLocal]
  )

  const setActive = useCallback(
    (terminalId: string | null) => {
      if (!project) return
      setActiveTerminal(project.id, terminalId)
    },
    [project, setActiveTerminal]
  )

  return {
    terminals: project?.terminals ?? [],
    activeId,
    create,
    close,
    rename,
    setActive,
  }
}
