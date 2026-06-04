import { useEffect, useRef } from 'react'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
} from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands'
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language'
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { oneDark } from '@codemirror/theme-one-dark'
import { languageExtensionFor } from '@renderer/lib/code-mirror-language'
import { halcyonTheme } from '@renderer/lib/codemirror-halcyon-theme'
import { useTheme, type ThemeName } from '@renderer/lib/theme'
import { useSettings, type EditorSettings } from '@renderer/state/settings'

interface Props {
  /** Stable key — re-mounts editor when the open file changes. */
  fileKey: string
  filename: string
  initialContent: string
  onChange: (text: string) => void
  onSave: (text: string) => void
  /** Returns formatted text or null if the file isn't formattable / format failed. */
  format?: (text: string) => Promise<string | null>
  readOnly?: boolean
}

export function CodeEditor({
  filename,
  initialContent,
  onChange,
  onSave,
  format,
  readOnly = false,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)

  // Stable callback refs so we can rebuild the view without losing handlers.
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const formatRef = useRef(format)
  useEffect(() => {
    onChangeRef.current = onChange
    onSaveRef.current = onSave
    formatRef.current = format
  })

  // Live snapshot of settings for use inside the always-stable keymap.
  const settings = useSettings((s) => s.editor)
  const settingsRef = useRef(settings)
  useEffect(() => {
    settingsRef.current = settings
  })

  const { theme } = useTheme()
  const themeRef = useRef(theme)
  useEffect(() => {
    themeRef.current = theme
  })

  // Compartments for everything that can change without recreating the view.
  const themeCompartment = useRef(new Compartment())
  const styleCompartment = useRef(new Compartment())
  const wrapCompartment = useRef(new Compartment())
  const gutterCompartment = useRef(new Compartment())
  const tabCompartment = useRef(new Compartment())

  const doFormat = async (): Promise<string | null> => {
    const view = viewRef.current
    if (!view) return null
    const fn = formatRef.current
    if (!fn) return null
    const current = view.state.doc.toString()
    const formatted = await fn(current)
    if (formatted === null || formatted === current) return formatted
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: formatted },
    })
    return formatted
  }

  useEffect(() => {
    if (!hostRef.current) return

    const styleExt = makeStyleExt(settingsRef.current)
    const wrapExt = settingsRef.current.wordWrap ? EditorView.lineWrapping : []
    const gutterExt = settingsRef.current.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []
    const tabExt = [
      EditorState.tabSize.of(settingsRef.current.tabSize),
      indentUnit.of(
        settingsRef.current.insertSpaces ? ' '.repeat(settingsRef.current.tabSize) : '\t'
      ),
    ]

    const extensions: Extension[] = [
      gutterCompartment.current.of(gutterExt),
      highlightActiveLine(),
      foldGutter(),
      history(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      highlightSelectionMatches(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      EditorState.allowMultipleSelections.of(true),
      tabCompartment.current.of(tabExt),
      wrapCompartment.current.of(wrapExt),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        indentWithTab,
        {
          key: 'Mod-s',
          preventDefault: true,
          run: (view) => {
            const finalize = (text: string) => onSaveRef.current(text)
            if (settingsRef.current.formatOnSave && formatRef.current) {
              void doFormat().then((formatted) => {
                finalize(formatted ?? view.state.doc.toString())
              })
            } else {
              finalize(view.state.doc.toString())
            }
            return true
          },
        },
        {
          key: 'Mod-Shift-f',
          preventDefault: true,
          run: () => {
            void doFormat()
            return true
          },
        },
      ]),
      EditorView.updateListener.of((v) => {
        if (v.docChanged) onChangeRef.current(v.state.doc.toString())
      }),
      themeCompartment.current.of(themeExtFor(themeRef.current)),
      styleCompartment.current.of(styleExt),
    ]
    if (readOnly) extensions.push(EditorState.readOnly.of(true))
    const lang = languageExtensionFor(filename)
    if (lang) extensions.push(lang)

    const view = new EditorView({
      state: EditorState.create({ doc: initialContent, extensions }),
      parent: hostRef.current,
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Recreate only on file/language change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename, readOnly])

  // Reactively re-configure compartments when settings or theme change.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: [
        styleCompartment.current.reconfigure(makeStyleExt(settings)),
        wrapCompartment.current.reconfigure(settings.wordWrap ? EditorView.lineWrapping : []),
        gutterCompartment.current.reconfigure(
          settings.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []
        ),
        tabCompartment.current.reconfigure([
          EditorState.tabSize.of(settings.tabSize),
          indentUnit.of(settings.insertSpaces ? ' '.repeat(settings.tabSize) : '\t'),
        ]),
        themeCompartment.current.reconfigure(themeExtFor(theme)),
      ],
    })
  }, [
    settings.fontSize,
    settings.fontFamily,
    settings.wordWrap,
    settings.lineNumbers,
    settings.tabSize,
    settings.insertSpaces,
    settings,
    theme,
  ])

  return <div ref={hostRef} className="h-full w-full overflow-hidden" />
}

function themeExtFor(theme: ThemeName): Extension {
  return theme === 'halcyon' ? halcyonTheme : oneDark
}

function makeStyleExt(s: EditorSettings): Extension {
  // Paint the editor surface with the same --background the terminal uses,
  // rather than oneDark's hard-coded #282c34. `var(--background)` means the
  // theme picks up live without needing to recreate the view.
  return EditorView.theme({
    '&': {
      height: '100%',
      fontSize: `${s.fontSize}px`,
      backgroundColor: 'var(--background)',
    },
    '.cm-scroller': {
      fontFamily: s.fontFamily,
      lineHeight: '1.55',
      backgroundColor: 'var(--background)',
    },
    '.cm-content': { padding: '8px 0' },
    '.cm-gutters': { backgroundColor: 'var(--background)', border: 'none' },
  })
}
