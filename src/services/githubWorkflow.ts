// Servizio minimale per triggerare GitHub Actions workflow_dispatch.
// Richiede un GitHub Personal Access Token (scope: repo o workflow).
// Il token viene persistito su Firestore (settings.githubPat) e cachato in localStorage.

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

export type WorkflowRunStatus = 'queued' | 'in_progress' | 'completed' | 'unknown'

export interface WorkflowRunInfo {
  status: WorkflowRunStatus
  conclusion: string | null  // 'success' | 'failure' | null
  runId: number
  createdAt: string
}

/**
 * Restituisce lo stato dell'ultimo run del workflow.
 * Richiede il PAT salvato.
 */
export async function getLatestWorkflowRun(
  owner: string,
  repo: string,
  workflow: string,
): Promise<WorkflowRunInfo | null> {
  const pat = getStoredPat()
  if (!pat) return null

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/runs?per_page=1`,
    {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github+json',
      },
    },
  )
  if (!res.ok) return null
  const data = (await res.json()) as { workflow_runs?: Array<{id: number; status: string; conclusion: string | null; created_at: string}> }
  const run = data.workflow_runs?.[0]
  if (!run) return null
  return {
    status: (run.status as WorkflowRunStatus) ?? 'unknown',
    conclusion: run.conclusion,
    runId: run.id,
    createdAt: run.created_at,
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
