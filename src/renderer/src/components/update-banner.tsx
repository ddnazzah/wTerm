import { useEffect } from 'react'
import { useUpdates } from '@renderer/state/updates'

/**
 * Top-center pill that appears once a new version has downloaded in the
 * background, offering an immediate restart. Mounted once at the app root.
 */
export function UpdateBanner() {
  const status = useUpdates((s) => s.status)
  const dismissedVersion = useUpdates((s) => s.dismissedVersion)
  const init = useUpdates((s) => s.init)
  const install = useUpdates((s) => s.install)
  const dismiss = useUpdates((s) => s.dismiss)

  useEffect(() => init(), [init])

  if (status.state !== 'downloaded') return null
  if (dismissedVersion === status.version) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-accent/25 bg-background/95 px-3 py-1.5 shadow-2xl backdrop-blur-sm">
        <span className="flex h-5 w-5 items-center justify-center text-accent" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <path d="m7 11 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
        </span>
        <span className="text-[13px] text-foreground/90">
          wTerm <span className="tabular-nums font-medium">{status.version}</span> is ready
        </span>
        <button
          type="button"
          onClick={install}
          className="rounded-full bg-accent/90 px-3 py-1 text-[12px] font-medium text-background hover:bg-accent"
        >
          Restart
        </button>
        <button
          type="button"
          onClick={() => dismiss(status.version)}
          className="rounded-full px-2 py-1 text-[12px] text-foreground/55 hover:text-foreground"
        >
          Later
        </button>
      </div>
    </div>
  )
}
