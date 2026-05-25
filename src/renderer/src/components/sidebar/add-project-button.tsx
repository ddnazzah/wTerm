import { Button } from '@heroui/react'

interface Props {
  onAdd: () => void
}

export function AddProjectButton({ onAdd }: Props) {
  return (
    <Button
      onPress={onAdd}
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2 text-foreground/80 hover:text-foreground"
    >
      <span aria-hidden className="text-base leading-none">+</span>
      Add project
    </Button>
  )
}
