import { useCallback, useEffect } from 'react'
import { useWorkspace } from '@renderer/state/store'
import { useSettings } from '@renderer/state/settings'

// useProjects is consumed by more than one component, so its bootstrap effect
// runs once per consumer. Restoring Claude tabs must happen exactly once per app
// launch (not once per consumer), so guard it with a module-level flag that
// outlives individual mounts. pty.create is also idempotent on terminal id, but
// we avoid the duplicate IPC round-trips entirely.
let claudeRestoreStarted = false

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

      // Bring back Claude tabs from the previous session: each persisted tab
      // carries the session id wTerm launched it with, so we recreate its PTY
      // running `claude --resume <id>`. Reuse the persisted tab id so the
      // recreated PTY lines up with the tab the snapshot just rendered. Run this
      // at most once per launch even though multiple components mount this hook.
      if (claudeRestoreStarted) return
      claudeRestoreStarted = true
      const startupCommand = useSettings.getState().terminal.startupCommand.trim() || undefined
      for (const project of snapshot.projects) {
        for (const terminal of project.terminals) {
          if (!terminal.claudeSessionId) continue
          void window.api.terminals.create({
            projectId: project.id,
            id: terminal.id,
            name: terminal.name,
            resumeSessionId: terminal.claudeSessionId,
            startupCommand,
          })
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [setProjects])

  // The mobile bridge mutates authoritative state in main on the phone's behalf
  // (create/kill/rename a terminal, switch project). Main pushes the full state
  // here so the desktop UI reconciles. setProjects is an idempotent merge, so
  // re-applying the snapshot is safe; PTY data still arrives via terminals.onData.
  useEffect(() => {
    return window.api.state.onChanged((state) => {
      setProjects(state.projects, {
        selectedProjectId: state.selectedProjectId,
        activeTerminalByProject: state.activeTerminalByProject ?? {},
      })
    })
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
