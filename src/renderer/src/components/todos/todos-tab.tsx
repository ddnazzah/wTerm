import { useCallback, useEffect, useState } from 'react'
import type { Todo, TodosSnapshot } from '@shared/types'
import { findProjectForPath, planSessionOpen } from '@shared/todo-session'
import { HOME_PROJECT_ID } from '@shared/types'
import { TODOS_TAB_PATH } from '@renderer/lib/tab-uri'
import { collectorWarning, coversTerminal, groupTodos, projectLabel } from '@renderer/lib/todo-view'
import { useSettings } from '@renderer/state/settings'
import { useWorkspace } from '@renderer/state/store'

const EMPTY: TodosSnapshot = { todos: [], collector: null }

const ROW_BUTTON =
  'px-1.5 h-6 rounded text-[11px] text-foreground/60 hover:text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent'

function useTodos(): TodosSnapshot {
  const [snapshot, setSnapshot] = useState<TodosSnapshot>(EMPTY)

  useEffect(() => {
    const refresh = (): void => {
      window.api.todos
        .snapshot()
        .then(setSnapshot)
        .catch((err: unknown) => console.error('[todos] snapshot failed:', err))
    }
    refresh()
    return window.api.todos.onChanged(refresh)
  }, [])

  return snapshot
}

/** Focus the tab already on this session, or resume it in a new one. */
async function openSession(todo: Todo): Promise<string | null> {
  if (!(await window.api.todos.folderExists(todo.id))) {
    return `${todo.cwd} no longer exists, so this session cannot be resumed.`
  }
  const workspace = useWorkspace.getState()
  const startupCommand = useSettings.getState().terminal.startupCommand
  const plan = planSessionOpen(workspace.projects, todo, startupCommand)
  if (!plan) return `No workspace contains ${todo.cwd}.`

  workspace.selectProject(plan.projectId)
  if (plan.projectId === HOME_PROJECT_ID) workspace.setBottomPanelOpen(true)
  // The editor panel shows while its project has any open tab, and it floats over
  // the terminal. Closing only this tab leaves the user's own files alone.
  workspace.openFiles
    .filter((file) => file.path === TODOS_TAB_PATH)
    .forEach((file) => workspace.closeFile(file))
  if (coversTerminal(workspace.openFiles, plan.projectId, workspace.editorViewMode)) {
    workspace.setEditorViewMode('docked')
  }

  if (plan.kind === 'focus') {
    workspace.setActiveTerminal(plan.projectId, plan.terminalId)
    return null
  }
  const record = await window.api.terminals.create({
    projectId: plan.projectId,
    id: crypto.randomUUID(),
    name: todo.title,
    cwd: plan.cwd,
    resumeSessionId: plan.sessionId,
    startupCommand: plan.startupCommand,
  })
  if (!record) return 'Could not open a terminal for this session.'
  workspace.addTerminal(plan.projectId, record)
  return null
}

interface RowProps {
  todo: Todo
  onError: (message: string | null) => void
}

function TodoRow({ todo, onError }: RowProps) {
  const isDone = todo.status === 'done'
  const projects = useWorkspace((s) => s.projects)
  // A session often runs in a subfolder, so prefer the project's own name.
  const label = findProjectForPath(projects, todo.cwd)?.name ?? projectLabel(todo.cwd)

  const open = (): void => {
    openSession(todo)
      .then(onError)
      .catch((err: unknown) => onError(String(err)))
  }
  const send = (): void => {
    window.api.todos
      .sendToBoard(todo.id)
      .then((result) => onError(result.ok ? null : (result.error ?? 'Could not send to the board.')))
      .catch((err: unknown) => onError(String(err)))
  }
  const setStatus = (status: Todo['status']): void => {
    window.api.todos.setStatus(todo.id, status).catch((err: unknown) => onError(String(err)))
  }

  return (
    <li className="group flex items-start gap-2.5 px-3 py-2 rounded-md hover:bg-surface/60">
      <input
        type="checkbox"
        checked={isDone}
        onChange={() => setStatus(isDone ? 'open' : 'done')}
        aria-label={isDone ? `Reopen ${todo.title}` : `Mark ${todo.title} done`}
        className="mt-0.5 flex-shrink-0 accent-accent"
      />
      {/* Actions sit beside the text when there is room and wrap below it when docked. */}
      <div className="flex-1 min-w-0 flex flex-wrap items-start gap-x-2.5 gap-y-1">
        <div className="flex-1 min-w-[220px]">
          <div className={`text-[13px] leading-snug ${isDone ? 'line-through text-foreground/45' : 'text-foreground/90'}`}>
            {todo.title}
          </div>
          {todo.detail && !isDone && (
            <div className="mt-0.5 text-[12px] leading-snug text-foreground/55">{todo.detail}</div>
          )}
          <div className="mt-1 flex gap-1.5 text-[11px] font-mono text-foreground/35">
            <span className="truncate">
              {label}
              {todo.branch ? ` · ${todo.branch}` : ''}
            </span>
            {todo.card && <span className="flex-shrink-0">· on board #{todo.card.number}</span>}
          </div>
        </div>
        {!isDone && (
          <div className="flex items-center gap-0.5 flex-shrink-0 -ml-1.5">
            <button type="button" className={ROW_BUTTON} onClick={open}>
              Open session
            </button>
            <button type="button" className={ROW_BUTTON} onClick={send} disabled={Boolean(todo.card)}>
              Send to board
            </button>
            <button type="button" className={ROW_BUTTON} onClick={() => setStatus('dismissed')}>
              Dismiss
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

interface SectionProps {
  label: string
  todos: Todo[]
  onError: (message: string | null) => void
}

function TodoSection({ label, todos, onError }: SectionProps) {
  if (todos.length === 0) return null
  return (
    <section className="mb-4">
      <header className="flex items-center gap-1.5 px-3 h-7">
        <span className="text-[11px] font-medium text-foreground/70">{label}</span>
        <span className="text-[10px] text-foreground/35">{todos.length}</span>
      </header>
      <ul>
        {todos.map((todo) => (
          <TodoRow key={todo.id} todo={todo} onError={onError} />
        ))}
      </ul>
    </section>
  )
}

/** Things to do, collected from Claude sessions across every project. */
export function TodosTab() {
  const { todos, collector } = useTodos()
  const [error, setError] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const onError = useCallback((message: string | null) => setError(message), [])

  const now = new Date()
  const groups = groupTodos(todos, now)
  const warning = collectorWarning(collector, now)
  const isEmpty = groups.now.length + groups.tomorrow.length + groups.future.length === 0

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-background">
      <div className="max-w-[820px] mx-auto px-3 py-4">
        {warning && (
          <div role="status" className="mb-3 px-3 py-2 rounded-md text-[12px] bg-amber-400/10 text-amber-300">
            {warning}
          </div>
        )}
        {error && (
          <div role="alert" className="mb-3 px-3 py-2 rounded-md text-[12px] bg-red-400/10 text-red-300">
            {error}
          </div>
        )}
        {isEmpty && <div className="px-3 py-8 text-center text-[13px] text-foreground/45">Nothing to do.</div>}
        <TodoSection label="Now" todos={groups.now} onError={onError} />
        <TodoSection label="Tomorrow" todos={groups.tomorrow} onError={onError} />
        <TodoSection label="Future" todos={groups.future} onError={onError} />
        {groups.done.length > 0 && (
          <button
            type="button"
            onClick={() => setShowDone((shown) => !shown)}
            className="px-3 h-7 text-[11px] text-foreground/50 hover:text-foreground"
          >
            {showDone ? 'Hide' : 'Show'} done ({groups.done.length})
          </button>
        )}
        {showDone && <TodoSection label="Done" todos={groups.done} onError={onError} />}
      </div>
    </div>
  )
}
