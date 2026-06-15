import { useEffect, useState } from 'react'
import type { Project } from '@shared/types'

interface Props {
  project: Project | null
}

export function StatusBar({ project }: Props) {
  const [branch, setBranch] = useState<string | null>(null)
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    window.api.system.getVersion().then(setVersion).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!project) {
      setBranch(null)
      return
    }
    window.api.git
      .info(project.id)
      .then((info) => {
        if (!cancelled) setBranch(info.isRepo ? info.branch : null)
      })
      .catch(() => {
        if (!cancelled) setBranch(null)
      })
    return () => {
      cancelled = true
    }
  }, [project])

  const termCount = project?.terminals.length ?? 0

  return (
    <footer className="flex items-center gap-3 h-6 px-3 text-[11px] text-foreground/60 border-t border-accent/14 bg-surface/60 flex-shrink-0 select-none">
      {branch && (
        <span className="flex items-center gap-1" title="Current branch">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
          {branch}
        </span>
      )}
      {project && (
        <span title="Open terminals">{termCount} {termCount === 1 ? 'terminal' : 'terminals'}</span>
      )}
      <span className="flex-1" />
      {version && <span className="text-foreground/40">v{version}</span>}
    </footer>
  )
}
