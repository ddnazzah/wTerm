# Plan: Port VS Code themes to the in-app editor

Status: not started
Editor target: CodeMirror 6 (current). No migration to Monaco required.

## Goal

Allow the app to load a VS Code theme JSON and use it for both the UI chrome
(panels, tabs, sidebar) and the CodeMirror editor's syntax highlighting, so the
user's preferred VS Code theme works inside wTerm without swapping editors.

## How a VS Code theme maps onto our stack

A VS Code theme JSON has three top-level sections; each maps to a different
part of our stack:

1. `colors` — UI chrome colors (`editor.background`, `sideBar.background`,
   `tab.activeBackground`, etc.).
   → Maps onto our existing CSS custom properties in
   `src/renderer/src/styles/themes.css` and `globals.css`. The editor surface
   already reads `var(--background)` (see `code-editor.tsx` `makeStyleExt`), so
   most of this is a key-translation table from VS Code color keys to our
   design tokens.

2. `tokenColors` — TextMate scopes for syntax highlighting (`keyword`,
   `string`, `entity.name.function`, etc.).
   → Needs real conversion. CodeMirror uses Lezer highlight tags, not TextMate
   scopes. Replace the current `defaultHighlightStyle` + `oneDark` usage in
   `code-editor.tsx` with a generated `HighlightStyle.define([...])` built from
   the theme.

3. `semanticTokenColors` — LSP-driven semantic colors.
   → Skip. No LSP is wired up, so these would have no effect.

## Implementation steps

1. Add `@uiw/codemirror-themes` (provides `createTheme({ settings, styles })`
   which yields a CodeMirror `Extension`).
2. Write `src/renderer/src/lib/vscode-theme.ts` exposing
   `vscodeThemeToCM(json)` that:
   - Reads `colors.*` and emits the CSS variable block (or a runtime style
     injection keyed to the active theme id).
   - Translates `tokenColors[].scope` strings into Lezer tags via a fixed
     lookup table — about 30 entries covers ~95% of common themes.
   - Returns `{ cssVars, cmExtension }`.
3. Wire it into the editor:
   - Swap `themeCompartment.current.of(oneDark)` in `code-editor.tsx` for the
     generated extension.
   - Reconfigure the compartment when the active theme changes, so swapping
     themes does not re-mount the editor.
4. Add a "Themes" section in `settings-modal.tsx` (import-from-JSON + a small
   set of bundled presets).
5. Persist the active theme via `state/settings.ts`.

## Known gaps vs. true VS Code parity

- Some TextMate scopes have no clean Lezer equivalent → those tokens fall back
  to a default color.
- Editor features that aren't theme-related but users might expect:
  bracket pair colorization, inlay hints, sticky scroll, minimap — none exist
  in our editor regardless of theme.
- `fontStyle: italic | bold | underline` works; `strikethrough` needs a custom
  rule.

## Files that will change

- `src/renderer/src/components/workspace/code-editor.tsx` — swap theme +
  highlight style for the generated extension.
- `src/renderer/src/lib/vscode-theme.ts` — new adapter.
- `src/renderer/src/styles/themes.css` — accept runtime-injected variables for
  imported themes.
- `src/renderer/src/components/settings-modal.tsx` — import UI + preset
  picker.
- `src/renderer/src/state/settings.ts` — persist the active theme.
- `package.json` — add `@uiw/codemirror-themes`.
