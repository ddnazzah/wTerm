import * as prettier from 'prettier/standalone'

// Parser plugins — loaded lazily so the editor pane doesn't pay for them up front.
type PluginSet = Awaited<ReturnType<typeof loadPlugins>>

async function loadPlugins() {
  const [estree, babel, typescript, postcss, html, markdown, yaml] = await Promise.all([
    import('prettier/plugins/estree'),
    import('prettier/plugins/babel'),
    import('prettier/plugins/typescript'),
    import('prettier/plugins/postcss'),
    import('prettier/plugins/html'),
    import('prettier/plugins/markdown'),
    import('prettier/plugins/yaml'),
  ])
  return [
    estree.default ?? estree,
    babel.default ?? babel,
    typescript.default ?? typescript,
    postcss.default ?? postcss,
    html.default ?? html,
    markdown.default ?? markdown,
    yaml.default ?? yaml,
  ]
}

let pluginCache: Promise<PluginSet> | null = null
function plugins(): Promise<PluginSet> {
  if (!pluginCache) pluginCache = loadPlugins()
  return pluginCache
}

export function formattableParser(filename: string): string | null {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.d.ts') || lower.endsWith('.ts')) return 'typescript'
  if (lower.endsWith('.tsx')) return 'typescript'
  if (lower.endsWith('.jsx')) return 'babel'
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'babel'
  if (lower.endsWith('.json') || lower.endsWith('.jsonc')) return 'json'
  if (lower.endsWith('.css')) return 'css'
  if (lower.endsWith('.scss')) return 'scss'
  if (lower.endsWith('.less')) return 'less'
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html'
  if (lower.endsWith('.vue')) return 'vue'
  if (lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.mdx'))
    return 'markdown'
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml'
  return null
}

export interface FormatOptions {
  tabWidth: number
  useTabs: boolean
}

export async function formatText(
  source: string,
  filename: string,
  opts: FormatOptions
): Promise<string> {
  const parser = formattableParser(filename)
  if (!parser) throw new Error(`No formatter for ${filename}`)
  const result = await prettier.format(source, {
    parser,
    plugins: await plugins(),
    tabWidth: opts.tabWidth,
    useTabs: opts.useTabs,
    printWidth: 100,
    singleQuote: parser === 'typescript' || parser === 'babel',
    trailingComma: 'es5',
  })
  return result
}
