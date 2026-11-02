#!/usr/bin/env node
// Installs the collector as a launchd agent: `pnpm todos:install`, and
// `pnpm todos:uninstall` to remove it. It copies the scripts out of the repo so
// switching branches or deleting a worktree cannot break the running job.

import { execFileSync, spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const LABEL = 'com.wterm.session-todos'
export const RUN_INTERVAL_SECONDS = 30 * 60

const SCRIPT_FILES = ['collect.mjs', 'collect-lib.mjs']
const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(homedir(), 'Library/Application Support/wTerm/session-todos')
const INSTALL_DIR = join(DATA_DIR, 'bin')
const PLIST_PATH = join(homedir(), 'Library/LaunchAgents', `${LABEL}.plist`)

function xml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** launchd starts with a minimal PATH, so everything it needs is spelled out here. */
export function buildPlist({ nodePath, scriptPath, dataDir, pathEnv }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(nodePath)}</string>
    <string>${xml(scriptPath)}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${xml(pathEnv)}</string>
    <key>WTERM_TODOS_DIR</key><string>${xml(dataDir)}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>${RUN_INTERVAL_SECONDS}</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardErrorPath</key><string>${xml(join(dataDir, 'collector.log'))}</string>
</dict>
</plist>
`
}

const launchDomain = () => `gui/${userInfo().uid}`

function unload() {
  // Fails harmlessly when the job is not loaded.
  spawnSync('launchctl', ['bootout', `${launchDomain()}/${LABEL}`], { stdio: 'ignore' })
}

async function install() {
  const claudePath = execFileSync('/usr/bin/which', ['claude'], { encoding: 'utf-8' }).trim()
  await fs.mkdir(INSTALL_DIR, { recursive: true })
  await Promise.all(
    SCRIPT_FILES.map((name) => fs.copyFile(join(SCRIPTS_DIR, name), join(INSTALL_DIR, name)))
  )
  const pathEnv = [dirname(claudePath), dirname(process.execPath), '/usr/bin', '/bin'].join(':')
  const plist = buildPlist({
    nodePath: process.execPath,
    scriptPath: join(INSTALL_DIR, 'collect.mjs'),
    dataDir: DATA_DIR,
    pathEnv,
  })
  await fs.mkdir(dirname(PLIST_PATH), { recursive: true })
  await fs.writeFile(PLIST_PATH, plist, 'utf-8')
  unload()
  execFileSync('launchctl', ['bootstrap', launchDomain(), PLIST_PATH])
  process.stdout.write(`Installed ${LABEL}. It runs now and every 30 minutes.\n`)
}

async function uninstall() {
  unload()
  await fs.rm(PLIST_PATH, { force: true })
  process.stdout.write(`Removed ${LABEL}. Collected todos in ${DATA_DIR} were kept.\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await (process.argv.includes('--uninstall') ? uninstall() : install())
}
