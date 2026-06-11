import { create } from 'zustand'
import type { UpdateStatus } from '@shared/types'

interface UpdatesState {
  status: UpdateStatus
  /** Set when the user dismisses the "ready" banner for the current version. */
  dismissedVersion: string | null
  /** Subscribe to main-process status pushes; returns an unsubscribe fn. */
  init: () => () => void
  check: () => void
  install: () => void
  dismiss: (version: string) => void
}

export const useUpdates = create<UpdatesState>((set) => ({
  status: { state: 'idle' },
  dismissedVersion: null,
  init: () => {
    void window.api.updater.getStatus().then((status) => set({ status }))
    return window.api.updater.onStatus((status) => set({ status }))
  },
  check: () => {
    void window.api.updater.check()
  },
  install: () => {
    void window.api.updater.install()
  },
  dismiss: (version) => set({ dismissedVersion: version }),
}))
