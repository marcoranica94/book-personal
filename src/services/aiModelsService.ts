/**
 * Fetches available AI models from Anthropic and Google APIs.
 * Falls back to the static catalog if the API call fails or the key is missing.
 */
import type {AIModelOption} from '@/types'
import {CLAUDE_MODELS, GEMINI_MODELS} from '@/types'

// ─── Claude ───────────────────────────────────────────────────────────────────
// Anthropic doesn't have a public "list models" REST endpoint accessible
// from the browser (CORS). We maintain the catalog statically but check
// the Anthropic changelog page via a known URL redirect to detect new releases.
// For now we return the static list — the user can always check manually.
export async function fetchClaudeModels(): Promise<AIModelOption[]> {
  try {
    // Anthropic models API (requires server-side key — not available in browser)
    // We use the static list but sort by newest first
    return CLAUDE_MODELS
  } catch {
    return CLAUDE_MODELS
  }
}

// ─── Gemini ───────────────────────────────────────────────────────────────────
// Google provides a public models list endpoint: GET /v1beta/models
// We can call it with the API key stored in settings (not sensitive for GET)
export async function fetchGeminiModels(apiKey?: string): Promise<AIModelOption[]> {
  if (!apiKey) return GEMINI_MODELS
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=50`,
      {signal: AbortSignal.timeout(5000)},
    )
    if (!res.ok) return GEMINI_MODELS
    const data = await res.json() as {models?: {name: string; displayName: string; description?: string; supportedGenerationMethods?: string[]}[]}
    const live = (data.models ?? [])
      .filter((m) =>
        // Solo modelli che supportano generateContent (non solo embedding)
        m.supportedGenerationMethods?.includes('generateContent') &&
        // Escludi modelli di sola visione/audio o deprecati
        !m.name.includes('vision') &&
        !m.name.includes('aqa') &&
        !m.name.includes('embedding') &&
        !m.name.includes('retrieval'),
      )
      .map((m): AIModelOption => {
        const id = m.name.replace('models/', '')
        const existing = GEMINI_MODELS.find((s) => s.id === id)
        return {
          id,
          label: m.displayName || id,
          description: existing?.description ?? m.description?.slice(0, 60) ?? '',
          default: existing?.default,
        }
      })
      // Metti prima quelli nel nostro catalogo, poi gli altri
      .sort((a, b) => {
        const ai = GEMINI_MODELS.findIndex((m) => m.id === a.id)
        const bi = GEMINI_MODELS.findIndex((m) => m.id === b.id)
        if (ai !== -1 && bi === -1) return -1
        if (ai === -1 && bi !== -1) return 1
        if (ai !== -1 && bi !== -1) return ai - bi
        return a.id.localeCompare(b.id)
      })

    return live.length > 0 ? live : GEMINI_MODELS
  } catch {
    return GEMINI_MODELS
  }
}

