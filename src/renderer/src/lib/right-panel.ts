import type { GitFileStatusMap } from '@shared/types'

// The right panel: Changes and Files share one activity-bar button and switch with
// a tab strip; Search keeps a button of its own.

export type RightSidebarTab = 'git' | 'files' | 'search'
export type PanelButton = 'changesFiles' | 'search'

export interface RightPanelState {
  tab: RightSidebarTab
  collapsed: boolean
}

/** Changes is where the panel opens unless another tab was saved. */
const DEFAULT_TAB: RightSidebarTab = 'git'

export function parseRightSidebarTab(raw: string | null): RightSidebarTab {
  return raw === 'git' || raw === 'files' || raw === 'search' ? raw : DEFAULT_TAB
}

function belongsTo(tab: RightSidebarTab, button: PanelButton): boolean {
  return button === 'search' ? tab === 'search' : tab !== 'search'
}

/** The tab a button opens: Changes & Files returns to whichever of the two was last used. */
function tabFor(state: RightPanelState, button: PanelButton): RightSidebarTab {
  if (button === 'search') return 'search'
  return belongsTo(state.tab, button) ? state.tab : DEFAULT_TAB
}

export function isPanelButtonActive(state: RightPanelState, button: PanelButton): boolean {
  return !state.collapsed && belongsTo(state.tab, button)
}

/** Clicking the button that is showing hides the panel; any other click shows its tab. */
export function clickPanelButton(state: RightPanelState, button: PanelButton): RightPanelState {
  if (isPanelButtonActive(state, button)) return { ...state, collapsed: true }
  return { tab: tabFor(state, button), collapsed: false }
}

export function changedFileCount(status: GitFileStatusMap): number {
  return Object.keys(status).length
}
