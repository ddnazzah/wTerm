import { describe, expect, it } from 'vitest'
import { parsePorcelainStatus } from './parse-status'

describe('parsePorcelainStatus', () => {
  it('returns empty map for empty input', () => {
    expect(parsePorcelainStatus('')).toEqual({})
  })

  it('maps modified, added, deleted, untracked, conflict', () => {
    // `git status --porcelain=v1 -z` uses NUL separators, no trailing newline.
    const z = [
      ' M src/a.ts',   // worktree modified
      'A  src/b.ts',   // staged add
      ' D src/c.ts',   // worktree delete
      '?? src/d.ts',   // untracked
      'UU src/e.ts',   // conflict
    ].join('\0') + '\0'
    expect(parsePorcelainStatus(z)).toEqual({
      'src/a.ts': 'modified',
      'src/b.ts': 'added',
      'src/c.ts': 'deleted',
      'src/d.ts': 'untracked',
      'src/e.ts': 'conflict',
    })
  })

  it('handles renames (R) by recording the new path as modified', () => {
    // rename entries are emitted as `R  new\0old\0`
    const z = 'R  new.ts\0old.ts\0'
    expect(parsePorcelainStatus(z)).toEqual({ 'new.ts': 'modified' })
  })
})
