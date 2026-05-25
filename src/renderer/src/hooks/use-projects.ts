import { useCallback, useEffect } from 'react'
import { useWorkspace } from '@renderer/state/store'

export function useProjects() {
  const projects = useWorkspace((s) => s.projects)
  const selectedProjectId = useWorkspace((s) => s.selectedProjectId)
  const setProjects = useWorkspace((s) => s.setProjects)
  const upsertProject = useWorkspace((s) => s.upsertProject)
  const removeProject = useWorkspace((s) => s.removeProject)
  const selectProject = useWorkspace((s) => s.selectProject)
  const renameProject = useWorkspace((s) => s.renameProject)

  useEffect(() => {
    let cancelled = false
    window.api.projects.snapshot().then((snapshot) => {
      if (cancelled) return
      setProjects(snapshot.projects, {
        selectedProjectId: snapshot.selectedProjectId,
        activeTerminalByProject: snapshot.activeTerminalByProject ?? {},
      })
    })
    return () => {
      cancelled = true
    }
  }, [setProjects])

  const addProject = useCallback(async (): Promise<void> => {
    const folder = await window.api.dialog.pickFolder()
    if (!folder) return
    const created = await window.api.projects.add(folder)
    upsertProject(created)
    selectProject(created.id)
  }, [upsertProject, selectProject])

  const remove = useCallback(
    async (id: string) => {
      await window.api.projects.remove(id)
      removeProject(id)
    },
    [removeProject]
  )

  const rename = useCallback(
    async (id: string, name: string) => {
      renameProject(id, name)
      await window.api.projects.rename(id, name)
    },
    [renameProject]
  )

  const select = useCallback(
    async (id: string | null) => {
      selectProject(id)
      await window.api.projects.select(id)
    },
    [selectProject]
  )

  const openInITerm = useCallback((id: string) => window.api.projects.openInITerm(id), [])
  const openInFinder = useCallback((id: string) => window.api.projects.openInFinder(id), [])

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null

  return {
    projects,
    selectedProject,
    selectedProjectId,
    addProject,
    remove,
    rename,
    select,
    openInITerm,
    openInFinder,
  }
}
