import { useEffect } from 'react'
import type { TerminalId } from '@shared/types'
import { useAutopilot } from '@renderer/state/autopilot'
import { autopilotTooltip } from '@renderer/lib/autopilot-label'

type Props = {
  terminalId: TerminalId
}

/**
 * The per-session Autopilot switch. Always visible while on, so it is obvious
 * which sessions are answering for the user; on hover only while off. Its
 * tooltip is the log of what Autopilot chose.
 */
export function AutopilotToggle({ terminalId }: Props) {
  const snapshot = useAutopilot((s) => s.byId[terminalId])
  const put = useAutopilot((s) => s.put)

  useEffect(() => {
    if (snapshot) return
    let alive = true
    void window.api.autopilot.snapshot(terminalId).then((s) => alive && put(s))
    return () => {
      alive = false
    }
  }, [terminalId, snapshot, put])

  const isOn = snapshot?.enabled ?? false

  const handleClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    void window.api.autopilot.setEnabled(terminalId, !isOn).then(put)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={autopilotTooltip(snapshot)}
      aria-label={isOn ? 'Turn Autopilot off' : 'Turn Autopilot on'}
      aria-pressed={isOn}
      className={[
        'rounded-sm h-4 px-1 inline-flex items-center justify-center text-[9px] font-semibold leading-none tracking-wide transition-opacity',
        isOn
          ? 'text-accent bg-accent/15 hover:bg-accent/25'
          : 'opacity-0 group-hover/term:opacity-100 text-foreground/40 hover:text-foreground hover:bg-foreground/10',
      ].join(' ')}
    >
      AUTO
    </button>
  )
}
