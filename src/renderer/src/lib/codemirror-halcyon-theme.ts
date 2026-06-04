import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { RangeSetBuilder, type Extension } from '@codemirror/state'

// Halcyon syntax palette — sourced from bchiang7/halcyon-vscode tokenColors.
const violet = '#c3a6ff'
const green = '#bae67e'
const yellow = '#ffd580'
const orange = '#ffae57'
const cyan = '#5ccfe6'
const red = '#ef6b73'
const fg = '#a2aabc'
const comment = '#96a6cc99'
const cursor = '#ffcc66'
const selection = 'rgba(255, 204, 102, 0.25)'
const activeLine = 'rgba(150, 166, 204, 0.06)'
const gutterFg = '#5c6773'

const halcyonEditorTheme = EditorView.theme(
  {
    // Surface inherits from app CSS vars so the editor never disagrees with the rest of the chrome.
    '&': { color: fg, backgroundColor: 'var(--background)' },
    '.cm-content': { caretColor: cursor },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: cursor },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      { backgroundColor: selection },
    '.cm-activeLine': { backgroundColor: activeLine },
    '.cm-activeLineGutter': { backgroundColor: activeLine },
    '.cm-selectionMatch': { backgroundColor: 'rgba(186, 230, 126, 0.15)' },
    '.cm-searchMatch': {
      backgroundColor: 'rgba(255, 204, 102, 0.25)',
      outline: '1px solid #ffcc66',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'rgba(255, 204, 102, 0.45)',
    },
    '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
      backgroundColor: 'rgba(92, 207, 230, 0.2)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--background)',
      color: gutterFg,
      border: 'none',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'transparent',
      border: 'none',
      color: gutterFg,
    },
    '.cm-panels': { backgroundColor: '#171c28', color: fg },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid #2f3b54' },
    '.cm-panels.cm-panels-bottom': { borderTop: '1px solid #2f3b54' },
    '.cm-tooltip': { border: '1px solid #2f3b54', backgroundColor: '#171c28' },
    '.cm-tooltip .cm-tooltip-arrow:before': {
      borderTopColor: 'transparent',
      borderBottomColor: 'transparent',
    },
    '.cm-tooltip .cm-tooltip-arrow:after': {
      borderTopColor: '#171c28',
      borderBottomColor: '#171c28',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': {
        backgroundColor: '#2f3b54',
        color: fg,
      },
    },
    // Coral for destructured import bindings (see importBindingsPlugin).
    // Descendant selector + !important is required to beat HighlightStyle's
    // per-token class color which sits on a nested span and wins on specificity
    // otherwise.
    '.cm-halcyon-import-binding, .cm-halcyon-import-binding > span': {
      color: `${red} !important`,
    },
  },
  { dark: true }
)

const halcyonHighlightStyle = HighlightStyle.define([
  // storage.type / storage.modifier / generic keyword — `const`, `let`, `function`, `class`, `new`, etc.
  { tag: [t.keyword, t.definitionKeyword, t.modifier], color: violet },
  // keyword.control + keyword.control.import + keyword.operator → orange in Halcyon
  { tag: [t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: orange, fontStyle: 'italic' },
  { tag: [t.operator, t.derefOperator, t.compareOperator, t.logicOperator, t.arithmeticOperator, t.bitwiseOperator], color: orange },
  // strings, headings, inserted markup
  { tag: [t.string, t.special(t.string), t.processingInstruction, t.inserted], color: green },
  // regexp + escape → orange per Halcyon's string.regexp / constant.escape mapping
  { tag: [t.regexp], color: orange },
  { tag: [t.escape], color: violet },
  // constants — numbers, booleans, null, named constants — violet (#c3a6ff)
  { tag: [t.number, t.bool, t.atom, t.null, t.constant(t.name), t.standard(t.name)], color: violet },
  // functions / methods / class names → yellow
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: yellow },
  { tag: [t.typeName, t.className, t.namespace, t.self], color: yellow },
  // JSX/HTML tags → cyan; attributes → orange
  { tag: [t.tagName], color: cyan },
  { tag: [t.attributeName], color: orange },
  // property access — `obj.prop` — prop name reads as foreground (variable.other.object.property in Halcyon)
  { tag: [t.propertyName], color: fg },
  // identifiers / variable names / punctuation → foreground
  { tag: [t.variableName, t.definition(t.name), t.separator, t.punctuation, t.bracket, t.brace, t.paren, t.squareBracket, t.angleBracket], color: fg },
  // comments — italicized muted blue
  { tag: [t.meta, t.comment, t.lineComment, t.blockComment, t.docComment], color: comment, fontStyle: 'italic' },
  { tag: t.invalid, color: red },
  { tag: t.deleted, color: red },
  { tag: t.changed, color: violet },
  { tag: t.url, color: cyan, textDecoration: 'underline' },
  { tag: t.link, color: cyan, textDecoration: 'underline' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.heading, fontWeight: 'bold', color: green },
])

// Halcyon colors the destructured names inside `import { ... }` coral (the
// `variable.import.parameter.js` scope). Lezer's JS parser doesn't expose that
// context as a distinct highlight tag — it just tags them as VariableDefinition
// like any other binding — so we walk the tree and decorate them via class.
// The matching theme rule above uses a descendant selector to override the
// per-token color class that HighlightStyle places on the nested span.
const importBindingDeco = Decoration.mark({ class: 'cm-halcyon-import-binding' })

const importBindingsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = this.build(view)
    }

    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.decorations = this.build(u.view)
      }
    }

    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>()
      const tree = syntaxTree(view.state)
      for (const { from, to } of view.visibleRanges) {
        tree.iterate({
          from,
          to,
          enter: (node) => {
            if (node.name !== 'ImportDeclaration') return
            node.node.cursor().iterate((child) => {
              if (child.name === 'VariableDefinition') {
                builder.add(child.from, child.to, importBindingDeco)
              }
            })
            return false
          },
        })
      }
      return builder.finish()
    }
  },
  { decorations: (v) => v.decorations }
)

export const halcyonTheme: Extension = [
  halcyonEditorTheme,
  syntaxHighlighting(halcyonHighlightStyle),
  importBindingsPlugin,
]
