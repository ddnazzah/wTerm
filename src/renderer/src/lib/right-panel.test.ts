import { describe, expect, test } from 'vitest'
import {
  changedFileCount,
  clickPanelButton,
  isPanelButtonActive,
  parseRightSidebarTab,
  type RightPanelState,
} from './right-panel'

const open = (tab: RightPanelState['tab']): RightPanelState => ({ tab, collapsed: false })
const closed = (tab: RightPanelState['tab']): RightPanelState => ({ tab, collapsed: true })

describe('parseRightSidebarTab', () => {
  test.each(['git', 'files', 'search'] as const)('keeps a saved %s tab', (tab) => {
    expect(parseRightSidebarTab(tab)).toBe(tab)
  })

  test.each([null, '', 'explorer', 'GIT'])('opens on Changes when nothing valid was saved (%s)', (raw) => {
    expect(parseRightSidebarTab(raw)).toBe('git')
  })
})

describe('clickPanelButton: Changes & Files button', () => {
  test('opens a collapsed panel on the tab last used there', () => {
    expect(clickPanelButton(closed('files'), 'changesFiles')).toEqual(open('files'))
    expect(clickPanelButton(closed('git'), 'changesFiles')).toEqual(open('git'))
  })

  test('opens on Changes when the panel was last showing search', () => {
    expect(clickPanelButton(closed('search'), 'changesFiles')).toEqual(open('git'))
    expect(clickPanelButton(open('search'), 'changesFiles')).toEqual(open('git'))
  })

  test('collapses the panel when it is already showing Changes or Files', () => {
    expect(clickPanelButton(open('git'), 'changesFiles')).toEqual(closed('git'))
    expect(clickPanelButton(open('files'), 'changesFiles')).toEqual(closed('files'))
  })
})

describe('clickPanelButton: Search button', () => {
  test('switches an open Changes or Files panel to search', () => {
    expect(clickPanelButton(open('files'), 'search')).toEqual(open('search'))
  })

  test('opens a collapsed panel on search', () => {
    expect(clickPanelButton(closed('git'), 'search')).toEqual(open('search'))
  })

  test('collapses the panel when search is already showing', () => {
    expect(clickPanelButton(open('search'), 'search')).toEqual(closed('search'))
  })
})

describe('isPanelButtonActive', () => {
  test('lights the Changes & Files button for both of its tabs', () => {
    expect(isPanelButtonActive(open('git'), 'changesFiles')).toBe(true)
    expect(isPanelButtonActive(open('files'), 'changesFiles')).toBe(true)
    expect(isPanelButtonActive(open('files'), 'search')).toBe(false)
  })

  test('lights nothing while the panel is collapsed', () => {
    expect(isPanelButtonActive(closed('git'), 'changesFiles')).toBe(false)
    expect(isPanelButtonActive(closed('search'), 'search')).toBe(false)
  })
})

describe('changedFileCount', () => {
  test('counts every changed path in the project', () => {
    expect(changedFileCount({ 'a.ts': 'modified', 'b/c.ts': 'untracked' })).toBe(2)
  })

  test('is zero for a clean tree', () => {
    expect(changedFileCount({})).toBe(0)
  })
})
