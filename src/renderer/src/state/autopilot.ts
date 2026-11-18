import { create } from 'zustand'
import type { AutopilotSnapshot, TerminalId } from '@shared/types'

// Mirror of main's per-session Autopilot state. Main pushes a snapshot whenever
// one changes; a row that has not seen one yet asks for it on mount.

interface AutopilotState {
  byId: Record<TerminalId, AutopilotSnapshot>
  put: (snapshot: AutopilotSnapshot) => void
  /** Re-fetch every known session, e.g. after the default changed in main. */
  refreshAll: () => Promise<void>
}

export const useAutopilot = create<AutopilotState>((set, get) => ({
  byId: {},
  put: (snapshot) => set((s) => ({ byId: { ...s.byId, [snapshot.terminalId]: snapshot } })),
  refreshAll: async () => {
    const ids = Object.keys(get().byId)
    const snapshots = await Promise.all(ids.map((id) => window.api.autopilot.snapshot(id)))
    set((s) => ({ byId: { ...s.byId, ...Object.fromEntries(snapshots.map((x) => [x.terminalId, x])) } }))
  },
}))
