import {create} from 'zustand'
import type {AnalysisError} from '@/services/analysisService'
import * as analysisService from '@/services/analysisService'
import type {AIProvider, ChapterAnalysis} from '@/types'

// analyses[chapterId][provider] = ChapterAnalysis
type AnalysesMap = Record<string, Record<AIProvider, ChapterAnalysis>>
type HistoryEntry = ChapterAnalysis & {_docId: string}

interface AnalysisStore {
  analyses: AnalysesMap
  analysisErrors: AnalysisError[]
  /** Storico analisi: history[chapterId][provider] = HistoryEntry[] */
  history: Record<string, Record<AIProvider, HistoryEntry[]>>
  isLoading: boolean
  error: string | null

  loadAnalysis: (chapterId: string) => Promise<void>
  loadAllAnalyses: () => Promise<void>
  loadAnalysisErrors: () => Promise<void>
  loadChapterHistory: (chapterId: string) => Promise<void>
  getAnalysis: (chapterId: string, provider: AIProvider) => ChapterAnalysis | null
  /** Helper: restituisce la prima analisi disponibile per un capitolo (preferisce il provider passato) */
  getAnyAnalysis: (chapterId: string, preferredProvider?: AIProvider) => ChapterAnalysis | null
  /** Helper: true se esiste almeno un'analisi per il capitolo */
  hasAnalysis: (chapterId: string) => boolean
  /** Lista provider disponibili per un capitolo */
  getProviders: (chapterId: string) => AIProvider[]
  /** Errori per un capitolo specifico */
  getChapterErrors: (chapterId: string) => AnalysisError[]
  /** Elimina l'analisi di un provider per un capitolo */
  deleteAnalysis: (chapterId: string, provider: AIProvider) => Promise<void>
  /** Elimina una singola entry dello storico */
  deleteHistoryEntry: (chapterId: string, provider: AIProvider, docId: string) => Promise<void>
  /** Rimuove un errore di analisi (da Firestore e dallo stato locale) */
  removeError: (chapterId: string, provider: string) => Promise<void>
}

export const useAnalysisStore = create<AnalysisStore>((set, get) => ({
  analyses: {},
  analysisErrors: [],
  history: {},
  isLoading: false,
  error: null,

  loadAnalysis: async (chapterId) => {
    set({isLoading: true})
    try {
      const byProvider = await analysisService.getChapterAnalysesByProvider(chapterId)
      if (Object.keys(byProvider).length > 0) {
        set((s) => ({
          analyses: {...s.analyses, [chapterId]: byProvider},
          isLoading: false,
        }))
      } else {
        set({isLoading: false})
      }
    } catch (err) {
      set({isLoading: false, error: (err as Error).message})
    }
  },

  loadAllAnalyses: async () => {
    set({isLoading: true})
    try {
      const all = await analysisService.getAllAnalyses()
      set({analyses: all, isLoading: false})
    } catch (err) {
      set({isLoading: false, error: (err as Error).message})
    }
  },

  loadAnalysisErrors: async () => {
    try {
      const errors = await analysisService.getAllAnalysisErrors()
      set({analysisErrors: errors})
    } catch {
      // Non bloccante
    }
  },

  loadChapterHistory: async (chapterId) => {
    try {
      const fullHistory = await analysisService.getChapterFullHistory(chapterId)
      set((s) => ({
        history: {...s.history, [chapterId]: fullHistory as Record<AIProvider, HistoryEntry[]>},
      }))
    } catch {
      // Non bloccante
    }
  },

  getAnalysis: (chapterId, provider) =>
    get().analyses[chapterId]?.[provider] ?? null,

  getAnyAnalysis: (chapterId, preferredProvider) => {
    const byProvider = get().analyses[chapterId]
    if (!byProvider) return null
    if (preferredProvider && byProvider[preferredProvider]) return byProvider[preferredProvider]
    const first = Object.values(byProvider)[0]
    return first ?? null
  },

  hasAnalysis: (chapterId) => {
    const byProvider = get().analyses[chapterId]
    return !!byProvider && Object.keys(byProvider).length > 0
  },

  getProviders: (chapterId) => {
    const byProvider = get().analyses[chapterId]
    return byProvider ? (Object.keys(byProvider) as AIProvider[]) : []
  },

  getChapterErrors: (chapterId) =>
    get().analysisErrors.filter((e) => e.chapterId === chapterId),

  deleteAnalysis: async (chapterId, provider) => {
    await analysisService.deleteProviderAnalysis(chapterId, provider)
    set((s) => {
      const byProvider = {...(s.analyses[chapterId] ?? {})}
      delete byProvider[provider]
      const analyses = {...s.analyses}
      if (Object.keys(byProvider).length === 0) {
        delete analyses[chapterId]
      } else {
        analyses[chapterId] = byProvider as Record<AIProvider, ChapterAnalysis>
      }
      return {analyses}
    })
  },

  removeError: async (chapterId, provider) => {
    await analysisService.deleteAnalysisError(chapterId, provider)
    set((s) => ({
      analysisErrors: s.analysisErrors.filter(
        (e) => !(e.chapterId === chapterId && e.provider === provider),
      ),
    }))
  },

  deleteHistoryEntry: async (chapterId, provider, docId) => {
    await analysisService.deleteHistoryEntry(chapterId, provider, docId)
    set((s) => {
      const chHistory = s.history[chapterId]
      if (!chHistory?.[provider]) return s
      return {
        history: {
          ...s.history,
          [chapterId]: {
            ...chHistory,
            [provider]: chHistory[provider].filter((e) => e._docId !== docId),
          },
        },
      }
    })
  },
}))
