import { ipcMain } from 'electron'
import { IPC, type GitFileStatusMap, type GitInfo, type ProjectId } from '@shared/types'
import { getProject } from '../store/state'
import { getFileStatus, getGitInfo, pushCurrentBranch } from '../git/local'

export function registerGitIpc(): void {
  ipcMain.handle(IPC.git.info, async (_e, projectId: ProjectId): Promise<GitInfo> => {
    const project = getProject(projectId)
    if (!project) {
      return {
        isRepo: false,
        branch: null,
        githubRepo: null,
        hasUpstream: false,
        ahead: 0,
        behind: 0,
        dirty: false,
        defaultBranch: null,
      }
    }
    return getGitInfo(project.path)
  })

  ipcMain.handle(
    IPC.git.push,
    async (_e, projectId: ProjectId, branch: string) => {
      const project = getProject(projectId)
      if (!project) return { ok: false, output: 'project not found' }
      return pushCurrentBranch(project.path, branch)
    }
  )

  ipcMain.handle(
    IPC.git.fileStatus,
    async (_e, projectId: ProjectId): Promise<GitFileStatusMap> => {
      const project = getProject(projectId)
      if (!project) return {}
      return getFileStatus(project.path)
    }
  )
}
