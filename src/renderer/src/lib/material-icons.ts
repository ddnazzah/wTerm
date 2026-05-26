import manifest from 'material-icon-theme/dist/material-icons.json'

// Eagerly bundle every SVG as a URL. Vite emits each as a static asset.
// Paths go: this file → renderer/src/lib → renderer/src → renderer → workspace → node_modules
const iconUrlsByPath = import.meta.glob<string>(
  '../../../../node_modules/material-icon-theme/icons/*.svg',
  { query: '?url', import: 'default', eager: true }
)

const iconUrls: Record<string, string> = {}
for (const [path, url] of Object.entries(iconUrlsByPath)) {
  const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.svg$/, '')
  iconUrls[name] = url
}

interface Manifest {
  iconDefinitions: Record<string, { iconPath: string }>
  fileExtensions: Record<string, string>
  fileNames: Record<string, string>
  folderNames: Record<string, string>
  folderNamesExpanded: Record<string, string>
  file: string
  folder: string
  folderExpanded: string
}

const m = manifest as Manifest

function resolveFileIconName(name: string): string {
  const lower = name.toLowerCase()
  if (m.fileNames[lower]) return m.fileNames[lower]!

  // Compound extensions first (e.g. ".test.ts", ".d.ts", ".stories.tsx")
  const parts = lower.split('.')
  for (let i = 1; i < parts.length; i++) {
    const candidate = parts.slice(i).join('.')
    if (m.fileExtensions[candidate]) return m.fileExtensions[candidate]!
  }
  return m.file
}

function resolveFolderIconName(name: string, isOpen: boolean): string {
  const lower = name.toLowerCase()
  const table = isOpen ? m.folderNamesExpanded : m.folderNames
  if (table[lower]) return table[lower]!
  return isOpen ? m.folderExpanded : m.folder
}

export function iconUrlFor(opts: {
  name: string
  isDirectory: boolean
  isOpen?: boolean
}): string | null {
  const iconName = opts.isDirectory
    ? resolveFolderIconName(opts.name, !!opts.isOpen)
    : resolveFileIconName(opts.name)
  return iconUrls[iconName] ?? iconUrls[opts.isDirectory ? m.folder : m.file] ?? null
}
