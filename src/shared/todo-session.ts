// Where a todo's Claude session belongs in the workspace. Pure and shared: main uses
// it to send a todo to a board, and the renderer uses it to reopen the session.

import { buildResumeCommand, isClaudeLaunch } from './claude-session'
import {
  HOME_PROJECT_ID,
  type Project,
  type ProjectId,
  type TerminalId,
  type TerminalRecord,
} from './types'

export type SessionOpenPlan =
  | { kind: 'focus'; projectId: ProjectId; terminalId: TerminalId }
  | {
      kind: 'create'
      projectId: ProjectId
      /** Relative to the project root; undefined means the root itself. */
      cwd: string | undefined
      sessionId: string
      startupCommand: string
    }

function isInside(root: string, path: string): boolean {
  const base = root.replace(/\/+$/, '')
  return path === base || path.startsWith(`${base}/`)
}

/** The most specific real project containing `path`. Home contains everything, so never Home. */
export function findProjectForPath(projects: Project[], path: string): Project | undefined {
  return projects
    .filter((p) => !p.isDefault && isInside(p.path, path))
    .sort((a, b) => b.path.length - a.path.length)[0]
}

function relativeTo(root: string, path: string): string | undefined {
  const base = root.replace(/\/+$/, '')
  return path === base ? undefined : path.slice(base.length + 1)
}

/**
 * The session Claude is running in this tab right now. claudeSessionId outlives the
 * process, so without a running Claude it only says what the tab would restore.
 */
function liveSessionId(terminal: TerminalRecord): string | undefined {
  const { agent, claudeSessionId } = terminal
  if (!agent) return undefined
  return agent.sessionId ?? (isClaudeLaunch(agent.command) ? claudeSessionId : undefined)
}

function findOpenTerminal(
  projects: Project[],
  sessionId: string
): { projectId: ProjectId; terminalId: TerminalId } | undefined {
  for (const project of projects) {
    const terminal = project.terminals.find((t) => liveSessionId(t) === sessionId)
    if (terminal) return { projectId: project.id, terminalId: terminal.id }
  }
  return undefined
}

/**
 * Prefer a tab already on the session. Otherwise resume in the owning project, or in
 * Home for a folder outside every project, such as a sibling worktree. `claude
 * --resume` only finds a session from its original folder, so a project whose root
 * would replace that folder is not a valid fallback.
 */
export function planSessionOpen(
  projects: Project[],
  target: { sessionId: string; cwd: string },
  startupCommand: string
): SessionOpenPlan | null {
  const open = findOpenTerminal(projects, target.sessionId)
  if (open) return { kind: 'focus', ...open }

  const home = projects.find((p) => p.id === HOME_PROJECT_ID)
  const owner =
    findProjectForPath(projects, target.cwd) ??
    (home && isInside(home.path, target.cwd) ? home : undefined)
  if (!owner) return null

  return {
    kind: 'create',
    projectId: owner.id,
    cwd: relativeTo(owner.path, target.cwd),
    sessionId: target.sessionId,
    startupCommand: buildResumeCommand(startupCommand, target.sessionId),
  }
}
