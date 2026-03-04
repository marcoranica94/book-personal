import {GITHUB_API_BASE, LS_TOKEN_KEY} from '@/utils/constants'
import type {GitHubFileContent, GitHubUser} from '@/types'

function getToken(): string {
  return localStorage.getItem(LS_TOKEN_KEY) ?? ''
}

async function githubFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken()
  const res = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (res.status === 401) {
    localStorage.removeItem(LS_TOKEN_KEY)
    window.location.href = '/book-personal/#/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { message?: string }).message ?? `GitHub API error: ${res.status}`)
  }

  if (res.status === 204) return {} as T
  return res.json() as Promise<T>
}

export async function getAuthenticatedUser(): Promise<GitHubUser> {
  return githubFetch<GitHubUser>('/user')
}

export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  branch: string
): Promise<GitHubFileContent> {
  return githubFetch<GitHubFileContent>(
    `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
  )
}

export async function putFileContent(
  owner: string,
  repo: string,
  path: string,
  content: string,
  sha: string | null,
  message: string,
  branch: string
): Promise<void> {
  const body: Record<string, unknown> = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch,
  }
  if (sha) body.sha = sha

  await githubFetch(`/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function revokeToken(token: string): Promise<void> {
  // Best-effort revoke via GitHub API
  try {
    await fetch(`${GITHUB_API_BASE}/applications/${import.meta.env.VITE_GITHUB_CLIENT_ID}/token`, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${btoa(`${import.meta.env.VITE_GITHUB_CLIENT_ID}:`)}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: token }),
    })
  } catch {
    // Ignore revoke errors — token will expire naturally
  }
}

export async function checkBranchExists(
  owner: string,
  repo: string,
  branch: string
): Promise<boolean> {
  try {
    await githubFetch(`/repos/${owner}/${repo}/branches/${branch}`)
    return true
  } catch {
    return false
  }
}

export async function getRefSha(
  owner: string,
  repo: string,
  ref: string // e.g. "heads/master"
): Promise<string> {
  const data = await githubFetch<{ object: { sha: string } }>(
    `/repos/${owner}/${repo}/git/ref/${ref}`
  )
  return data.object.sha
}

export async function createBranch(
  owner: string,
  repo: string,
  branchName: string,
  sha: string
): Promise<void> {
  await githubFetch(`/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
  })
}

export async function triggerWorkflow(
  owner: string,
  repo: string,
  workflowId: string,
  inputs: Record<string, string>
): Promise<void> {
  await githubFetch(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: 'master', inputs }),
  })
}
