import { useState, type ReactNode } from 'react'

interface Props {
  title: string
  /** Optional count/badge shown next to the title. */
  count?: number
  /** Right-aligned controls (filters, buttons). Clicks here never toggle the section. */
  actions?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}

/**
 * VSCode source-control–style collapsible section: a chevron header that toggles
 * a body. Header actions (filters, buttons) live to the right and stop click
 * propagation so they don't collapse the section.
 */
export function CollapsibleSection({ title, count, actions, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-b border-accent/7">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-1 flex-1 min-w-0 text-left text-foreground/55 hover:text-foreground transition-colors"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={`flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
          <h3 className="text-[11px] uppercase tracking-wider font-semibold truncate">{title}</h3>
          {typeof count === 'number' && (
            <span className="text-[10px] tabular-nums text-foreground/40 rounded-full bg-foreground/10 px-1.5 leading-[1.4]">
              {count}
            </span>
          )}
        </button>
        {actions && (
          <span className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {actions}
          </span>
        )}
      </div>
      {open && children}
    </section>
  )
}
