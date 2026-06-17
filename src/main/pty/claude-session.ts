// Helpers for making Claude Code sessions survive an app restart.
//
// wTerm can only resume a Claude session whose id it generated, so when a tab's
// startup command launches `claude`, we inject a `--session-id <uuid>` we own
// and persist it against the terminal record. On the next launch we rebuild the
// tab running `claude --resume <uuid>` instead of a dead bare shell. None of
// this touches the user's saved startup-command setting — the injection happens
// only on the command handed to the PTY.

/** Does this startup command launch the Claude Code CLI as its program? */
export function isClaudeLaunch(command: string | undefined): boolean {
  if (!command) return false
  return command.trim().split(/\s+/)[0] === 'claude'
}

/**
 * True when the command already pins a session itself (`--session-id`,
 * `--resume`/`-r`, `--continue`/`-c`). In that case the user is explicitly
 * driving session selection and we leave the command untouched.
 */
function pinsSessionExplicitly(command: string): boolean {
  return /(^|\s)(--session-id|--resume|-r|--continue|-c)(=|\s|$)/.test(command)
}

/**
 * Append a `--session-id <id>` to a Claude launch command so wTerm owns the
 * resulting transcript. Returns the command unchanged if it already pins a
 * session, or if it isn't a Claude launch.
 */
export function withSessionId(command: string, sessionId: string): string {
  if (!isClaudeLaunch(command) || pinsSessionExplicitly(command)) return command
  return `${command.trim()} --session-id ${sessionId}`
}

/**
 * Build the command that resumes a known session on restart. Preserves the
 * user's other configured flags (e.g. `--dangerously-skip-permissions`) but
 * strips any session-pinning flags first, then appends `--resume <id>`. Falls
 * back to a bare `claude --resume <id>` when the configured command no longer
 * launches Claude.
 */
export function buildResumeCommand(command: string | undefined, sessionId: string): string {
  const base = command?.trim()
  if (!base || !isClaudeLaunch(base)) return `claude --resume ${sessionId}`

  const tokens = base.split(/\s+/)
  const out: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok === '--session-id' || tok === '--resume' || tok === '-r') {
      // Drop the flag and its value (when the next token is the value, not a flag).
      if (tokens[i + 1] && !tokens[i + 1].startsWith('-')) i++
      continue
    }
    if (tok.startsWith('--session-id=') || tok.startsWith('--resume=')) continue
    if (tok === '--continue' || tok === '-c') continue
    out.push(tok)
  }
  out.push('--resume', sessionId)
  return out.join(' ')
}
