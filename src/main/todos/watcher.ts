// Imports suggestions when the collector writes them. Watches the directory rather
// than the file, because the file does not exist until the collector's first todo.

import { watch } from 'node:fs'
import type { TodoStore } from './store'

const DEBOUNCE_MS = 250
const SUGGESTIONS_FILE = 'suggestions.jsonl'
const STATUS_FILE = 'status.json'

/** Start watching and run one import for anything written while wTerm was closed. */
export function watchSuggestions(dir: string, store: TodoStore, onChanged: () => void): () => void {
  let timer: NodeJS.Timeout | null = null

  const runImport = (forceNotify: boolean): void => {
    store
      .importSuggestions()
      .then((changed) => {
        if (changed || forceNotify) onChanged()
      })
      .catch((err: unknown) => console.error('[todos] import failed:', err))
  }

  const watcher = watch(dir, (_event, filename) => {
    if (filename !== SUGGESTIONS_FILE && filename !== STATUS_FILE) return
    if (timer) clearTimeout(timer)
    // A status change alone has no new todos, but the tab's banner still must update.
    timer = setTimeout(() => runImport(filename === STATUS_FILE), DEBOUNCE_MS)
  })
  watcher.on('error', (err) => console.error('[todos] watcher failed:', err))

  runImport(false)

  return () => {
    if (timer) clearTimeout(timer)
    watcher.close()
  }
}
