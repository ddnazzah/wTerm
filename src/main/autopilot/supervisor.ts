import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import type { TranscriptView } from './transcript'

// The supervisor: one headless Claude call that decides what to do when an
// Autopilot session stops.
//
// It runs as `claude -p` on the user's own login, so there is no API key to
// manage, and it loads the user's global CLAUDE.md — the same rules they wrote
// for themselves. It gets no tools: it reads, decides and answers, nothing else.

export interface DecisionRecord {
  at: number
  action: string
  reply: string
  summary: string
}

/** Runs the supervisor on a prompt and resolves with its raw stdout. */
export type SupervisorRunner = (prompt: string) => Promise<string>

/** How long one decision may take before it counts as a failure (escalate). */
export const SUPERVISOR_TIMEOUT_MS = 120_000
/** The decisions shown back to the supervisor, newest last. */
const LOG_LINES_SHOWN = 10

const RULES = `You are supervising a Claude Code session on behalf of its user, who is away.
The session has just stopped. Decide what the user would say if they were here.

The user's standing rules:
- Once a goal is set, take the RECOMMENDED approach and carry it out. Never wait on an
  obvious next step. If the agent offered options, pick the one it recommended (or the
  clearly best one) and tell it to proceed.
- Do the whole job, including tests and verification. "Should work" is not done.
- Never authorise, on your own: push, PR, merge, force-push, deleting branches or data,
  credentials, spending money, or anything destructive or outward-facing.
  EXCEPTION: an action the user authorised in their own prompts below is allowed —
  matched literally, never widened ("push when done" allows a normal push of the work
  branch; it does NOT allow a force-push or a push to main/master).
- If the agent needs something only the user can provide (a password, a decision about
  what the goal even is, real-world access), escalate.

Answer with ONLY a JSON object, no other text:
{"action": "continue" | "done" | "escalate", "reply": string, "summary": string}
- continue: "reply" is the message sent to the agent as the user's answer. Be direct and
  specific ("Go with option A. Then write the tests and run them.").
- done: the goal in the user's prompts is fully met and verified. "summary" is the report
  the user reads: what was delivered and how it was verified, plus anything still open.
- escalate: "reply" is the exact question the user must answer; "summary" says why.`

function section(title: string, body: string): string {
  return `## ${title}\n${body.trim().length > 0 ? body : '(none)'}`
}

export function buildSupervisorPrompt(view: TranscriptView, log: readonly DecisionRecord[]): string {
  const prompts = view.prompts.map((p, i) => `${i + 1}. ${p}`).join('\n')
  const decisions = log
    .slice(-LOG_LINES_SHOWN)
    .map((d) => `- ${d.action}: ${d.reply || d.summary}`)
    .join('\n')
  return [
    RULES,
    section("The user's prompts (the goal, oldest first)", prompts),
    section('Replies you already sent this goal', decisions),
    section('Recent session activity', view.recent.join('\n')),
    section('Where the agent stopped', view.lastAssistant),
  ].join('\n\n')
}

/**
 * Arguments for the headless call. `--tools ""` removes every tool and
 * `--no-session-persistence` keeps these calls out of the user's session history.
 */
export const CLAUDE_ARGS = 'claude -p --output-format json --tools "" --no-session-persistence --model sonnet'

/**
 * The environment for the supervisor. WTERM_TERMINAL_ID is removed so the
 * supervisor's own hooks carry no terminal id: the hook server drops them, and
 * Autopilot can never end up supervising itself.
 */
export function supervisorEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { WTERM_TERMINAL_ID: _dropped, ...rest } = env
  return rest
}

/**
 * Run `claude -p` through the user's login shell. A GUI-launched app does not
 * inherit the shell's PATH, so this is how `claude` (and the node it may need)
 * resolve exactly as they do in the user's terminal. `exec` means the shell
 * neither expands aliases on it nor lingers once claude starts.
 */
export function createClaudeRunner(timeoutMs: number = SUPERVISOR_TIMEOUT_MS): SupervisorRunner {
  return (prompt) =>
    new Promise((resolve, reject) => {
      const shell = process.env.SHELL || '/bin/zsh'
      const child = spawn(shell, ['-ilc', `exec ${CLAUDE_ARGS}`], {
        cwd: tmpdir(),
        env: supervisorEnv(process.env),
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`supervisor timed out after ${Math.round(timeoutMs / 1000)}s`))
      }, timeoutMs)
      child.stdout.on('data', (d: Buffer) => (stdout += d.toString()))
      child.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
      child.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (code === 0) resolve(stdout)
        else reject(new Error(`supervisor exited ${code}: ${stderr.trim().slice(-300)}`))
      })
      child.stdin.end(prompt)
    })
}
