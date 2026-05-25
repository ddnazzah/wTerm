import { AddProjectButton } from './add-project-button'
import { ProjectItem } from './project-item'
import { useProjects } from '@renderer/hooks/use-projects'

export function ProjectList() {
  const { projects, selectedProjectId, addProject, remove, rename, select, openInITerm, openInFinder } =
    useProjects()

  return (
    <aside className="flex flex-col h-full w-64 border-r border-foreground/10 bg-background/40 backdrop-blur-sm">
      <header className="app-titlebar flex items-center h-11 px-3 pl-20 border-b border-foreground/10">
        <span className="text-[11px] uppercase tracking-wider text-foreground/40 font-medium">
          Projects
        </span>
      </header>

      <div className="flex-1 overflow-y-auto p-2">
        {projects.length === 0 ? (
          <div className="text-xs text-foreground/40 px-2 py-6 text-center">
            No projects yet.
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {projects.map((p) => (
              <ProjectItem
                key={p.id}
                project={p}
                selected={p.id === selectedProjectId}
                onSelect={() => void select(p.id)}
                onRename={(name) => void rename(p.id, name)}
                onRemove={() => void remove(p.id)}
                onOpenInITerm={() => void openInITerm(p.id)}
                onOpenInFinder={() => void openInFinder(p.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="p-2 border-t border-foreground/10">
        <AddProjectButton onAdd={() => void addProject()} />
      </div>
    </aside>
  )
}
