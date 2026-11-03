import { describe, expect, test } from 'vitest'
import { HOME_PROJECT_ID, type Project, type TerminalRecord, type Todo } from '@shared/types'
import { openTodoSession, type OpenSessionDeps, type OpenSessionWorkspace } from './open-todo-session'
import { TODOS_TAB_PATH } from './tab-uri'

const SESSION = '11111111-1111-4111-8111-111111111111'

interface File {
  projectId: string
  path: string
}

const todosTab: File = { projectId: 'app', path: TODOS_TAB_PATH }
const boardTab: File = { projectId: 'app', path: 'wterm://board' }
const created: TerminalRecord = { id: 'new', name: 'x', shell: 'zsh' }

const todo: Todo = {
  id: 'a',
  title: 'Fix it',
  detail: '',
  bucket: 'now',
  status: 'open',
  sessionId: SESSION,
  cwd: '/Users/me/app/sub',
  branch: 'main',
  createdAt: '2026-11-02T10:00:00',
}

function setup(overrides: { terminals?: Partial<TerminalRecord>[]; files?: File[] } = {}) {
  const calls: string[] = []
  const project: Project = {
    id: 'app',
    name: 'app',
    path: '/Users/me/app',
    color: '#fff',
    terminals: (overrides.terminals ?? []) as TerminalRecord[],
  }
  const workspace: OpenSessionWorkspace<File> = {
    projects: [project],
    openFiles: overrides.files ?? [todosTab],
    editorViewMode: 'modal',
    selectProject: (id) => calls.push(`select:${id}`),
    setBottomPanelOpen: () => calls.push('bottom'),
    closeFile: (file) => calls.push(`close:${file.path}`),
    dockEditorForSession: () => calls.push('dock'),
    setActiveTerminal: (_project, id) => calls.push(`focus:${id}`),
    addTerminal: (_project, record) => calls.push(`add:${record.id}`),
  }
  return { calls, workspace }
}

const deps = (
  workspace: OpenSessionWorkspace<File>,
  extra: Partial<OpenSessionDeps<File>> = {}
): OpenSessionDeps<File> => ({
  workspace,
  startupCommand: 'claude',
  folderExists: async () => true,
  createTerminal: async () => created,
  newId: () => 'new',
  ...extra,
})

describe('openTodoSession', () => {
  test('resumes in the session folder, then closes the Todos tab', async () => {
    const { calls, workspace } = setup()
    const options: unknown[] = []
    const createTerminal: OpenSessionDeps<File>['createTerminal'] = async (opts) => {
      options.push(opts)
      return created
    }

    expect(await openTodoSession(todo, deps(workspace, { createTerminal }))).toBeNull()

    expect(options).toEqual([
      expect.objectContaining({ projectId: 'app', cwd: 'sub', resumeSessionId: SESSION }),
    ])
    expect(calls).toEqual(['select:app', `close:${TODOS_TAB_PATH}`, 'add:new'])
  })

  test('keeps the Todos tab up to show the error when no terminal is created', async () => {
    const { calls, workspace } = setup()
    const result = await openTodoSession(todo, deps(workspace, { createTerminal: async () => null }))
    expect(result).toMatch(/Could not open a terminal/)
    expect(calls).toEqual([])
  })

  test('changes nothing on screen when creating the terminal throws', async () => {
    const { calls, workspace } = setup()
    const createTerminal = async (): Promise<TerminalRecord | null> => {
      throw new Error('boom')
    }
    await expect(openTodoSession(todo, deps(workspace, { createTerminal }))).rejects.toThrow('boom')
    expect(calls).toEqual([])
  })

  test('reports a missing folder without touching the workspace', async () => {
    const { calls, workspace } = setup()
    const result = await openTodoSession(todo, deps(workspace, { folderExists: async () => false }))
    expect(result).toMatch(/no longer exists/)
    expect(calls).toEqual([])
  })

  test('focuses a tab running the session instead of resuming it twice', async () => {
    const { calls, workspace } = setup({
      terminals: [{ id: 't1', claudeSessionId: SESSION, agent: { command: 'claude', cwd: '/x' } }],
    })
    expect(await openTodoSession(todo, deps(workspace))).toBeNull()
    expect(calls).toEqual(['select:app', `close:${TODOS_TAB_PATH}`, 'focus:t1'])
  })

  test('docks for the session when another tab would still cover the terminal', async () => {
    const { calls, workspace } = setup({ files: [todosTab, boardTab] })
    await openTodoSession(todo, deps(workspace))
    expect(calls).toContain('dock')
  })

  test('opens the bottom panel for a session that lands in Home', async () => {
    const { calls, workspace } = setup()
    const home: Project = {
      id: HOME_PROJECT_ID,
      name: 'Home',
      path: '/Users/me',
      color: '#fff',
      terminals: [],
      isDefault: true,
    }
    const elsewhere = { ...todo, cwd: '/Users/me/other' }
    await openTodoSession(elsewhere, deps({ ...workspace, projects: [home] }))
    expect(calls).toContain('bottom')
  })
})
