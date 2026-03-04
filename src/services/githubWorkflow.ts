// Servizio minimale per triggerare GitHub Actions workflow_dispatch.
// Richiede un GitHub Personal Access Token (scope: repo o workflow).
// Il token viene letto da localStorage (chiave: book_github_pat).

const LS_PAT_KEY = 'book_github_pat'

export function getStoredPat(): string {
  return localStorage.getItem(LS_PAT_KEY) ?? ''
}

export function setStoredPat(pat: string): void {
  if (pat) {
    localStorage.setItem(LS_PAT_KEY, pat)
  } else {
    localStorage.removeItem(LS_PAT_KEY)
  }
}

export async function triggerWorkflow(
  owner: string,
  repo: string,
  workflow: string,
  inputs: Record<string, string>
): Promise<void> {
  const pat = getStoredPat()
  if (!pat) throw new Error('Nessun GitHub PAT configurato. Vai in Impostazioni → Account.')

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ref: 'master', inputs}),
    }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as {message?: string}).message ?? `HTTP ${res.status}`)
  }
}
