import { getAuth } from './auth'

const BASE = 'https://api.github.com'

export class GitHubApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `GitHub API ${status}`)
    this.status = status
    this.body = body
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const auth = await getAuth()
  if (!auth) throw new GitHubApiError(401, null, 'not authenticated')
  return { Authorization: `Bearer ${auth.token}` }
}

async function jsonFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(init.headers as Record<string, string> | undefined),
    ...(await authHeader()),
  }
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'

  const url = path.startsWith('http') ? path : BASE + path
  const res = await fetch(url, { ...init, headers })
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }
  if (!res.ok) {
    const msg =
      (parsed && typeof parsed === 'object' && 'message' in parsed
        ? String((parsed as { message: unknown }).message)
        : undefined) ?? res.statusText
    throw new GitHubApiError(res.status, parsed, msg)
  }
  return parsed as T
}

export const gh = {
  get: <T>(path: string) => jsonFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    jsonFetch<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    jsonFetch<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    jsonFetch<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => jsonFetch<T>(path, { method: 'DELETE' }),
}
