import { Button } from '@heroui/react'

interface Props {
  hasSelection: boolean
  onCreateTerminal?: () => void
  onAddProject?: () => void
}

export function EmptyState({ hasSelection, onCreateTerminal, onAddProject }: Props) {
  if (!hasSelection) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-foreground/40 gap-3">
        <div className="text-sm">No project selected</div>
        <Button size="sm" variant="secondary" onPress={() => onAddProject?.()}>
          Add a project folder
        </Button>
      </div>
    )
  }
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-foreground/50 gap-3">
      <div className="text-sm">No terminals yet for this project.</div>
      <Button size="sm" onPress={() => onCreateTerminal?.()}>
        + New terminal
      </Button>
      <div className="text-[11px] text-foreground/40">⌘T to open a new terminal</div>
    </div>
  )
}
