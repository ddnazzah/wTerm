export type ProjectId = string
export type TerminalId = string

export interface TerminalRecord {
  id: TerminalId
  name: string
  shell: string
}

export interface Project {
  id: ProjectId
  name: string
  path: string
  color: string
  terminals: TerminalRecord[]
}

export interface AppState {
  version: 1
  selectedProjectId: ProjectId | null
  projects: Project[]
  activeTerminalByProject?: Record<ProjectId, TerminalId | null>
}

export interface CreateTerminalOptions {
  projectId: ProjectId
  name?: string
  shell?: string
}

export type TerminalDataPayload = { id: TerminalId; data: string }
export type TerminalExitPayload = { id: TerminalId; exitCode: number; signal?: number }

export const IPC = {
  projects: {
    snapshot: 'projects:snapshot',
    add: 'projects:add',
    remove: 'projects:remove',
    rename: 'projects:rename',
    select: 'projects:select',
    openInITerm: 'projects:open-in-iterm',
    openInFinder: 'projects:open-in-finder',
  },
  terminals: {
    create: 'terminals:create',
    attach: 'terminals:attach',
    write: 'terminals:write',
    resize: 'terminals:resize',
    kill: 'terminals:kill',
    rename: 'terminals:rename',
    data: 'terminals:data',
    exit: 'terminals:exit',
    setActive: 'terminals:set-active',
  },
  dialog: {
    pickFolder: 'dialog:pick-folder',
  },
  system: {
    notify: 'system:notify',
    focusTerminal: 'system:focus-terminal',
    openExternal: 'system:open-external',
  },
  fs: {
    list: 'fs:list',
    readText: 'fs:read-text',
    writeText: 'fs:write-text',
    createFile: 'fs:create-file',
    createFolder: 'fs:create-folder',
    rename: 'fs:rename',
    remove: 'fs:remove',
    open: 'fs:open',
    reveal: 'fs:reveal',
    saveTempPaste: 'fs:save-temp-paste',
  },
  git: {
    info: 'git:info',
    push: 'git:push',
  },
  github: {
    getSettings: 'github:get-settings',
    setClientId: 'github:set-client-id',
    setToken: 'github:set-token',
    signOut: 'github:sign-out',
    deviceStart: 'github:device-start',
    devicePoll: 'github:device-poll',
    listPullRequests: 'github:list-prs',
    getPullRequest: 'github:get-pr',
    createPullRequest: 'github:create-pr',
    mergePullRequest: 'github:merge-pr',
    commentPullRequest: 'github:comment-pr',
    listWorkflows: 'github:list-workflows',
    listRuns: 'github:list-runs',
    getRun: 'github:get-run',
    rerunRun: 'github:rerun-run',
    rerunFailed: 'github:rerun-failed',
    cancelRun: 'github:cancel-run',
    dispatchWorkflow: 'github:dispatch-workflow',
  },
} as const

export interface NotifyPayload {
  title: string
  body: string
  projectId: ProjectId
  terminalId: TerminalId
}

export interface FocusTerminalPayload {
  projectId: ProjectId
  terminalId: TerminalId
}

// ---- File system ----

export interface FsEntry {
  name: string
  /** path relative to the project root, using forward slashes; empty string = root */
  path: string
  isDirectory: boolean
  /** true if the path is ignored by git (matches a .gitignore rule, or sits under an ignored dir) */
  ignored?: boolean
}

// ---- Local git ----

export interface GitInfo {
  isRepo: boolean
  branch: string | null
  /** "owner/repo" if remote origin points at github.com, otherwise null */
  githubRepo: { owner: string; repo: string } | null
  /** branch has an upstream */
  hasUpstream: boolean
  ahead: number
  behind: number
  dirty: boolean
  /** the configured default branch on origin (HEAD), or null */
  defaultBranch: string | null
}

// ---- GitHub ----

export interface GitHubSettings {
  /** OAuth App client id used for device flow; null = device flow disabled */
  clientId: string | null
  /** true when a credential is stored (PAT or device-flow token) */
  hasToken: boolean
  /** authenticated user login (or null if not authenticated / unknown) */
  login: string | null
  /** how the token was obtained */
  source: 'pat' | 'device' | null
}

export interface DeviceFlowStart {
  deviceCode: string
  userCode: string
  verificationUri: string
  /** URL with user code pre-filled (`?user_code=...`). Opened in browser automatically. */
  verificationUriComplete: string
  expiresIn: number
  interval: number
}

export type DeviceFlowPoll =
  | { status: 'pending' }
  | { status: 'slow-down'; interval: number }
  | { status: 'authorized'; login: string }
  | { status: 'error'; error: string; description?: string }

export interface PullRequestSummary {
  number: number
  title: string
  state: 'open' | 'closed'
  draft: boolean
  merged: boolean
  url: string
  author: string
  authorAvatar: string | null
  headRef: string
  baseRef: string
  createdAt: string
  updatedAt: string
}

export interface PullRequestDetail extends PullRequestSummary {
  body: string
  mergeable: boolean | null
  mergeableState: string | null
  additions: number
  deletions: number
  changedFiles: number
  comments: Array<{
    id: number
    author: string
    avatar: string | null
    body: string
    createdAt: string
  }>
  checks: Array<{
    name: string
    status: string
    conclusion: string | null
    url: string | null
  }>
}

export interface CreatePullRequestInput {
  projectId: ProjectId
  title: string
  body: string
  head: string
  base: string
  draft: boolean
}

export interface WorkflowSummary {
  id: number
  name: string
  path: string
  state: string
}

export interface WorkflowRunSummary {
  id: number
  name: string | null
  workflowId: number
  branch: string | null
  event: string
  status: string
  conclusion: string | null
  url: string
  runNumber: number
  actor: string
  createdAt: string
  updatedAt: string
}

export interface WorkflowJob {
  id: number
  name: string
  status: string
  conclusion: string | null
  startedAt: string | null
  completedAt: string | null
  url: string
  steps: Array<{ name: string; status: string; conclusion: string | null; number: number }>
}

export interface WorkflowRunDetail extends WorkflowRunSummary {
  jobs: WorkflowJob[]
}
