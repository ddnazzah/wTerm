#!/usr/bin/env node
// Build resources/icon.icns from resources/logo.svg + resources/logo-small.svg.
// Uses the small variant for ≤32px slots and the main variant for ≥64px slots,
// matching what Apple does for its own app icons.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const resourcesDir = join(root, 'resources')
const iconsetDir = join(resourcesDir, 'icon.iconset')

const mainSvg = readFileSync(join(resourcesDir, 'logo.svg'), 'utf-8')
const smallSvg = readFileSync(join(resourcesDir, 'logo-small.svg'), 'utf-8')

/** [pixelSize, fileName, useSmallVariant] */
const slots = [
  [16,   'icon_16x16.png',     true],
  [32,   'icon_16x16@2x.png',  true],
  [32,   'icon_32x32.png',     true],
  [64,   'icon_32x32@2x.png',  false],
  [128,  'icon_128x128.png',   false],
  [256,  'icon_128x128@2x.png',false],
  [256,  'icon_256x256.png',   false],
  [512,  'icon_256x256@2x.png',false],
  [512,  'icon_512x512.png',   false],
  [1024, 'icon_512x512@2x.png',false],
]

rmSync(iconsetDir, { recursive: true, force: true })
mkdirSync(iconsetDir, { recursive: true })

for (const [size, name, useSmall] of slots) {
  const svg = useSmall ? smallSvg : mainSvg
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
  writeFileSync(join(iconsetDir, name), r.render().asPng())
  process.stdout.write(`  ${useSmall ? 'small' : 'main '} → ${size.toString().padStart(4)}px  ${name}\n`)
}

// Bundle the iconset into a single .icns using the macOS iconutil tool.
if (!existsSync('/usr/bin/iconutil')) {
  console.error('iconutil not found — this script needs to run on macOS.')
  process.exit(1)
}
execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconsetDir, '-o', join(resourcesDir, 'icon.icns')])

// Also emit a 1024×1024 PNG of the main variant for non-macOS / web use.
const png1024 = new Resvg(mainSvg, { fitTo: { mode: 'width', value: 1024 } }).render().asPng()
writeFileSync(join(resourcesDir, 'icon.png'), png1024)

// Clean up the intermediate iconset directory once .icns is built.
rmSync(iconsetDir, { recursive: true, force: true })

console.log('\nwrote:')
console.log('  resources/icon.icns')
console.log('  resources/icon.png  (1024×1024 fallback)')
