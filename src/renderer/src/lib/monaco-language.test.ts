import { describe, expect, it } from 'vitest'
import { languageForFilename } from './monaco-language'

describe('languageForFilename', () => {
  it('maps extensionless well-known files', () => {
    expect(languageForFilename('Dockerfile')).toBe('dockerfile')
    expect(languageForFilename('Makefile')).toBe('makefile')
    expect(languageForFilename('.gitignore')).toBe('ignore')
    expect(languageForFilename('.env.local')).toBe('ini')
  })
  it('returns undefined for normal extensions (Monaco infers them)', () => {
    expect(languageForFilename('app.ts')).toBeUndefined()
    expect(languageForFilename('main.rs')).toBeUndefined()
  })
})
