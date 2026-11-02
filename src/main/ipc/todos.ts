import { ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import {
  IPC,
  TODO_STATUSES,
  type ProjectId,
  type SendTodoResult,
  type Todo,
  type TodoStatus,
  type TodosSnapshot,
} from '@shared/types'
import { findProjectForPath } from '@shared/todo-session'
import { createCard } from '../board/store'
import { mainRepoPath } from '../board/worktree'
import { getState } from '../store/state'
import type { TodoStore } from '../todos/store'

/** A session's folder may be a worktree outside the project, so ask git too. */
async function resolveProjectId(cwd: string): Promise<ProjectId | undefined> {
  const { projects } = getState()
  const direct = findProjectForPath(projects, cwd)
  if (direct) return direct.id
  const repo = await mainRepoPath(cwd)
  return repo ? findProjectForPath(projects, repo)?.id : undefined
}

function cardBody(todo: Todo): string {
  return [todo.detail, `From Claude session \`${todo.sessionId}\` in \`${todo.cwd}\`.`]
    .filter(Boolean)
    .join('\n\n')
}

/** Always Backlog: todo text derives from transcripts, so only a person queues it. */
async function sendToBoard(
  store: TodoStore,
  todo: Todo,
  notifyBoardChanged: () => void
): Promise<SendTodoResult> {
  if (todo.card) return { ok: false, error: `Already on the board as #${todo.card.number}` }
  const projectId = await resolveProjectId(todo.cwd)
  if (!projectId) return { ok: false, error: `No wTerm project contains ${todo.cwd}` }

  const card = createCard({ projectId, title: todo.title, body: cardBody(todo), status: 'backlog' })
  await store.markSent(todo.id, { projectId, number: card.number })
  notifyBoardChanged()
  return { ok: true }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await fs.stat(path)).isDirectory()
  } catch {
    return false
  }
}

export function registerTodosIpc(
  store: TodoStore,
  notifyChanged: () => void,
  notifyBoardChanged: () => void
): void {
  ipcMain.handle(
    IPC.todos.snapshot,
    async (): Promise<TodosSnapshot> => ({
      todos: store.list(),
      collector: await store.readCollectorStatus(),
    })
  )

  ipcMain.handle(IPC.todos.setStatus, async (_e, id: string, status: TodoStatus): Promise<void> => {
    if (!TODO_STATUSES.includes(status)) return
    if (await store.setStatus(id, status)) notifyChanged()
  })

  ipcMain.handle(IPC.todos.sendToBoard, async (_e, id: string): Promise<SendTodoResult> => {
    const todo = store.get(id)
    if (!todo) return { ok: false, error: 'That todo no longer exists' }
    const result = await sendToBoard(store, todo, notifyBoardChanged)
    if (result.ok) notifyChanged()
    return result
  })

  ipcMain.handle(IPC.todos.folderExists, (_e, id: string): Promise<boolean> => {
    const todo = store.get(id)
    return todo ? isDirectory(todo.cwd) : Promise.resolve(false)
  })
}
