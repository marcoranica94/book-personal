import {create} from 'zustand'
import * as analysisService from '@/services/analysisService'
import type {AIProvider, ChapterAnalysis} from '@/types'

// analyses[chapterId][provider] = ChapterAnalysis
type AnalysesMap = Record<string, Record<AIProvider, ChapterAnalysis>>

interface AnalysisStore {
  analyses: AnalysesMap
  isLoading: boolean
  error: string | null

  loadAnalysis: (chapterId: string) => Promise<void>
  loadAllAnalyses: () => Promise<void>
  getAnalysis: (chapterId: string, provider: AIProvider) => ChapterAnalysis | null
  /** Helper: restituisce la prima analisi disponibile per un capitolo (preferisce il provider passato) */
  getAnyAnalysis: (chapterId: string, preferredProvider?: AIProvider) => ChapterAnalysis | null
  /** Helper: true se esiste almeno un'analisi per il capitolo */
  hasAnalysis: (chapterId: string) => boolean
  /** Lista provider disponibili per un capitolo */
  getProviders: (chapterId: string) => AIProvider[]
}

export const useAnalysisStore = create<AnalysisStore>((set, get) => ({
  analyses: {},
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
}))
