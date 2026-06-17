import type { GitFileStatus, GitFileStatusMap } from '@shared/types'

/**
 * Parse the output of `git status --porcelain=v1 -z` into a relPath→status map.
 * The -z form is NUL-separated; rename entries are `XY new\0old\0` (two fields).
 */
export function parsePorcelainStatus(z: string): GitFileStatusMap {
  const out: GitFileStatusMap = {}
  const parts = z.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]
    if (!entry) continue
    const x = entry[0]
    const y = entry[1]
    const path = entry.slice(3)
    if (!path) continue
    // Renames/copies consume the following NUL field (the old path).
    if (x === 'R' || x === 'C') {
      i++ // skip old path
      out[path] = 'modified'
      continue
    }
    out[path] = classify(x, y)
  }
  return out
}

function classify(x: string, y: string): GitFileStatus {
  if (x === '?' && y === '?') return 'untracked'
  if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
    return 'conflict'
  }
  if (x === 'A') return 'added'
  if (x === 'D' || y === 'D') return 'deleted'
  return 'modified'
}
