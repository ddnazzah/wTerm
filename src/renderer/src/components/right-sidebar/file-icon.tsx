import { iconUrlFor } from '@renderer/lib/material-icons'

interface Props {
  name: string
  isDirectory: boolean
  isOpen?: boolean
  size?: number
  className?: string
}

export function FileIcon({ name, isDirectory, isOpen, size = 16, className }: Props) {
  const url = iconUrlFor({ name, isDirectory, isOpen })
  if (!url) {
    return (
      <span
        className={`inline-block flex-shrink-0 ${className ?? ''}`}
        style={{ width: size, height: size }}
        aria-hidden
      />
    )
  }
  return (
    <img
      src={url}
      width={size}
      height={size}
      alt=""
      draggable={false}
      className={`inline-block flex-shrink-0 select-none ${className ?? ''}`}
    />
  )
}
