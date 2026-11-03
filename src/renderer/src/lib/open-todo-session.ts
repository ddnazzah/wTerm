// What "Open session" does for a todo. Takes its effects as arguments so their order
// can be tested without a window.

import { planSessionOpen } from '@shared/todo-session'
import {
  HOME_PROJECT_ID,
  type CreateTerminalOptions,
  type Project,
  type ProjectId,
  type TerminalId,
  type TerminalRecord,
  type Todo,
} from '@shared/types'
import { TODOS_TAB_PATH } from './tab-uri'
import { coversTerminal } from './todo-view'

interface OpenFile {
  projectId: ProjectId
  path: string
}

export interface OpenSessionWorkspace<F extends OpenFile = OpenFile> {
  projects: Project[]
  openFiles: F[]
  editorViewMode: string
  selectProject: (id: ProjectId) => void
  setBottomPanelOpen: (open: boolean) => void
  closeFile: (file: F) => void
  dockEditorForSession: () => void
  setActiveTerminal: (projectId: ProjectId, terminalId: TerminalId) => void
  addTerminal: (projectId: ProjectId, record: TerminalRecord) => void
}

export interface OpenSessionDeps<F extends OpenFile = OpenFile> {
  workspace: OpenSessionWorkspace<F>
  startupCommand: string
  folderExists: (todoId: string) => Promise<boolean>
  createTerminal: (options: CreateTerminalOptions) => Promise<TerminalRecord | null>
  newId: () => string
}

/**
 * The editor panel shows while its project has any open tab, and it floats over the
 * terminal. Closing only the Todos tab leaves the user's own files alone.
 */
function revealTerminal<F extends OpenFile>(
  workspace: OpenSessionWorkspace<F>,
  projectId: ProjectId
): void {
  workspace.selectProject(projectId)
  if (projectId === HOME_PROJECT_ID) workspace.setBottomPanelOpen(true)
  workspace.openFiles
    .filter((file) => file.path === TODOS_TAB_PATH)
    .forEach((file) => workspace.closeFile(file))
  if (coversTerminal(workspace.openFiles, projectId, workspace.editorViewMode)) {
    workspace.dockEditorForSession()
  }
}

/**
 * Focus the tab already running this session, or resume it in a new one. Returns the
 * reason it could not. Nothing on screen changes until that is settled, because the
 * Todos tab is where the reason is shown.
 */
export async function openTodoSession<F extends OpenFile>(
  todo: Todo,
  { workspace, startupCommand, folderExists, createTerminal, newId }: OpenSessionDeps<F>
): Promise<string | null> {
  if (!(await folderExists(todo.id))) {
    return `${todo.cwd} no longer exists, so this session cannot be resumed.`
  }
  const plan = planSessionOpen(workspace.projects, todo, startupCommand)
  if (!plan) return `No workspace contains ${todo.cwd}.`

  if (plan.kind === 'focus') {
    revealTerminal(workspace, plan.projectId)
    workspace.setActiveTerminal(plan.projectId, plan.terminalId)
    return null
  }
  const record = await createTerminal({
    projectId: plan.projectId,
    id: newId(),
    name: todo.title,
    cwd: plan.cwd,
    resumeSessionId: plan.sessionId,
    startupCommand: plan.startupCommand,
  })
  if (!record) return 'Could not open a terminal for this session.'
  revealTerminal(workspace, plan.projectId)
  workspace.addTerminal(plan.projectId, record)
  return null
}
