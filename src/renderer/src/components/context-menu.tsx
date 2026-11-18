import { useEffect } from 'react'

// The app's right-click menu: a floating panel at the pointer that closes on
// the next click or right-click anywhere, or when the window loses focus. Callers supply the
// items, so the file tree and the session sidebar share one look and behaviour.

export function ContextMenu({
  x,
  y,
  onClose,
  children,
}: {
  x: number
  y: number
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const handler = () => onClose()
    window.addEventListener('click', handler)
    window.addEventListener('blur', handler)
    // Capture phase: rows stop their right-click from bubbling, and another
    // row's menu must still close when a new one opens.
    window.addEventListener('contextmenu', handler, true)
    return () => {
      window.removeEventListener('click', handler)
      window.removeEventListener('blur', handler)
      window.removeEventListener('contextmenu', handler, true)
    }
  }, [onClose])

  return (
    <div
      role="menu"
      className="fixed z-50 min-w-44 rounded-lg border border-foreground/15 bg-background/95 backdrop-blur shadow-xl py-1 text-[13px]"
      style={{ top: y, left: x }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>
  )
}

export function MenuItem({
  onClick,
  children,
  danger,
}: {
  onClick: () => void
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={[
        'flex items-center w-full px-3 py-1.5 text-left transition-colors',
        danger
          ? 'text-red-400 hover:bg-red-500/15'
          : 'text-foreground/85 hover:bg-foreground/10',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function MenuDivider() {
  return <div className="my-1 mx-2 h-px bg-foreground/10" />
}
