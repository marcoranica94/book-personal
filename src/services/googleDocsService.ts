const DOCS_API = 'https://docs.googleapis.com/v1/documents'

/**
 * Applica sostituzioni di testo a un Google Doc usando batchUpdate replaceAllText.
 * Preserva interamente font, grassetti, spaziatura e tutto il formatting originale.
 */
export async function applyTextReplacements(
  accessToken: string,
  docId: string,
  replacements: Array<{original: string; suggested: string}>,
): Promise<{applied: number}> {
  if (replacements.length === 0) return {applied: 0}

  const requests = replacements.map(({original, suggested}) => ({
    replaceAllText: {
      containsText: {text: original, matchCase: true},
      replaceText: suggested,
    },
  }))

  const res = await fetch(`${DOCS_API}/${docId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({requests}),
  })

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {error?: {message?: string}}
    throw new Error(err.error?.message ?? `HTTP ${res.status}`)
  }

  const data = (await res.json()) as {replies?: Array<{replaceAllText?: {occurrencesChanged?: number}}>}
  const applied = data.replies?.reduce((sum, r) => sum + (r.replaceAllText?.occurrencesChanged ?? 0), 0) ?? 0
  return {applied}
}
