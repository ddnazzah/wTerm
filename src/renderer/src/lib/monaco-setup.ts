import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

// Locally-bundled workers — no CDN, works fully offline.
self.MonacoEnvironment = {
  getWorker(_id, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}

let defined = false
export function ensureThemes(): void {
  if (defined) return
  defined = true
  // Halcyon — ported from bchiang7/halcyon-vscode to match the app's CSS palette.
  // Surface #1d2433 (--background), fg #a2aabc, accent #ffcc66. Token colors:
  // keywords/constants violet, strings green, functions/types yellow, operators
  // orange, tags cyan, comments muted-italic.
  monaco.editor.defineTheme('wterm-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'a2aabc', background: '1d2433' },
      { token: 'comment', foreground: '96a6cc', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c3a6ff' },
      { token: 'storage', foreground: 'c3a6ff' },
      { token: 'operator', foreground: 'ffae57' },
      { token: 'delimiter', foreground: 'a2aabc' },
      { token: 'string', foreground: 'bae67e' },
      { token: 'string.escape', foreground: 'c3a6ff' },
      { token: 'regexp', foreground: 'ffae57' },
      { token: 'number', foreground: 'c3a6ff' },
      { token: 'constant', foreground: 'c3a6ff' },
      { token: 'type', foreground: 'ffd580' },
      { token: 'type.identifier', foreground: 'ffd580' },
      { token: 'class', foreground: 'ffd580' },
      { token: 'interface', foreground: 'ffd580' },
      { token: 'namespace', foreground: 'ffd580' },
      { token: 'function', foreground: 'ffd580' },
      { token: 'method', foreground: 'ffd580' },
      { token: 'identifier', foreground: 'a2aabc' },
      { token: 'variable', foreground: 'a2aabc' },
      { token: 'variable.parameter', foreground: 'a2aabc' },
      { token: 'property', foreground: 'a2aabc' },
      { token: 'tag', foreground: '5ccfe6' },
      { token: 'attribute.name', foreground: 'ffae57' },
      { token: 'attribute.value', foreground: 'bae67e' },
      { token: 'metatag', foreground: '5ccfe6' },
      { token: 'key', foreground: '5ccfe6' },
      { token: 'invalid', foreground: 'ef6b73' },
    ],
    colors: {
      'editor.background': '#1d2433',
      'editor.foreground': '#a2aabc',
      'editorGutter.background': '#1d2433',
      'editorLineNumber.foreground': '#5c6773',
      'editorLineNumber.activeForeground': '#a2aabc',
      'editor.lineHighlightBackground': '#96a6cc0f',
      'editor.selectionBackground': '#ffcc6640',
      'editor.inactiveSelectionBackground': '#ffcc6622',
      'editor.findMatchBackground': '#ffcc6655',
      'editor.findMatchHighlightBackground': '#ffcc6626',
      'editor.selectionHighlightBackground': '#bae67e26',
      'editorCursor.foreground': '#ffcc66',
      'editorBracketMatch.background': '#5ccfe633',
      'editorBracketMatch.border': '#5ccfe600',
      'editorIndentGuide.background': '#2f3b54',
      'editorIndentGuide.activeBackground': '#5c6773',
      'editorWhitespace.foreground': '#2f3b54',
      'editorWidget.background': '#171c28',
      'editorWidget.border': '#2f3b54',
      'editorSuggestWidget.background': '#171c28',
      'editorSuggestWidget.selectedBackground': '#2f3b54',
      'editorHoverWidget.background': '#171c28',
      'input.background': '#1d2433',
      'focusBorder': '#ffcc66',
      'scrollbarSlider.background': '#96a6cc33',
      'scrollbarSlider.hoverBackground': '#96a6cc55',
      'minimap.background': '#1d2433',
    },
  })
}

export { monaco }
