import type { Extension } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import { go } from '@codemirror/lang-go'
import { yaml } from '@codemirror/lang-yaml'
import { xml } from '@codemirror/lang-xml'
import { sql } from '@codemirror/lang-sql'

export function languageExtensionFor(filename: string): Extension | null {
  const lower = filename.toLowerCase()
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : lower
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return javascript({ jsx: ext === 'jsx' })
    case 'ts':
      return javascript({ typescript: true })
    case 'tsx':
      return javascript({ jsx: true, typescript: true })
    case 'json':
    case 'jsonc':
      return json()
    case 'md':
    case 'mdx':
    case 'markdown':
      return markdown()
    case 'html':
    case 'htm':
      return html()
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return css()
    case 'py':
    case 'pyi':
      return python()
    case 'rs':
      return rust()
    case 'go':
      return go()
    case 'yml':
    case 'yaml':
      return yaml()
    case 'xml':
    case 'svg':
      return xml()
    case 'sql':
      return sql()
    default:
      return null
  }
}
