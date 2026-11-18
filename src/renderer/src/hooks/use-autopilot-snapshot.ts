import { useEffect } from 'react'
import type { AutopilotSnapshot, TerminalId } from '@shared/types'
import { useAutopilot } from '@renderer/state/autopilot'

/** A session's Autopilot state; fetched once on mount, then kept live by main's pushes. */
export function useAutopilotSnapshot(terminalId: TerminalId): AutopilotSnapshot | undefined {
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

  return snapshot
}
