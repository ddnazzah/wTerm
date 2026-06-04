import { Button } from '@heroui/react'
import logoUrl from '../../../../../resources/logo.svg?url'
import { kbd } from '@renderer/lib/platform'

interface Props {
  hasSelection: boolean
  onCreateTerminal?: () => void
  onAddProject?: () => void
}

export function EmptyState({ hasSelection, onCreateTerminal, onAddProject }: Props) {
  if (!hasSelection) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6">
        <img
          src={logoUrl}
          alt="wTerm"
          width={112}
          height={112}
          className="select-none opacity-95"
          draggable={false}
        />
        <div className="flex flex-col items-center gap-1">
          <div className="text-base font-medium text-foreground/85">wTerm</div>
          <div className="text-[12px] text-foreground/45">Multi-project terminal IDE</div>
        </div>
        <Button size="sm" variant="secondary" onPress={() => onAddProject?.()}>
          Add a project folder
        </Button>
      </div>
    )
  }
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-foreground/50 gap-3">
      <div className="text-sm">No terminals yet for this project.</div>
      <Button size="sm" onPress={() => onCreateTerminal?.()}>
        + New terminal
      </Button>
      <div className="text-[11px] text-foreground/40">{kbd('T')} to open a new terminal</div>
    </div>
  )
}
