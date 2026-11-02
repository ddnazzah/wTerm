import { describe, expect, test } from 'vitest'
import { LABEL, RUN_INTERVAL_SECONDS, buildPlist } from './install.mjs'

const options = {
  nodePath: '/nvm/bin/node',
  scriptPath: '/data dir/bin/collect.mjs',
  dataDir: '/data dir',
  pathEnv: '/local/bin:/usr/bin',
}

describe('buildPlist', () => {
  test('runs node on the installed script, at load and on the interval', () => {
    const plist = buildPlist(options)
    expect(plist).toContain(`<string>${LABEL}</string>`)
    expect(plist).toContain('<string>/nvm/bin/node</string>')
    expect(plist).toContain('<string>/data dir/bin/collect.mjs</string>')
    expect(plist).toContain('<key>RunAtLoad</key><true/>')
    expect(plist).toContain(`<integer>${RUN_INTERVAL_SECONDS}</integer>`)
  })

  test('passes PATH explicitly because launchd does not inherit the shell', () => {
    expect(buildPlist(options)).toContain('<key>PATH</key><string>/local/bin:/usr/bin</string>')
  })

  test('escapes XML in paths so a folder name cannot break the file', () => {
    const plist = buildPlist({ ...options, dataDir: '/a&b<c>' })
    expect(plist).toContain('/a&amp;b&lt;c&gt;')
    expect(plist).not.toContain('/a&b')
  })
})
