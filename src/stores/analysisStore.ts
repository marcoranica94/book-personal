import {create} from 'zustand'
import * as analysisService from '@/services/analysisService'
import type {ChapterAnalysis} from '@/types'

interface AnalysisStore {
  analyses: Record<string, ChapterAnalysis>
  isLoading: boolean
  error: string | null

  loadAnalysis: (chapterId: string) => Promise<void>
  loadAllAnalyses: () => Promise<void>
  getAnalysis: (chapterId: string) => ChapterAnalysis | null
}

export const useAnalysisStore = create<AnalysisStore>((set, get) => ({
  analyses: {},
  isLoading: false,
  error: null,

  loadAnalysis: async (chapterId) => {
    set({isLoading: true})
    try {
      const analysis = await analysisService.getChapterAnalysis(chapterId)
      if (analysis) {
        set((s) => ({
          analyses: {...s.analyses, [chapterId]: analysis},
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

  getAnalysis: (chapterId) => get().analyses[chapterId] ?? null,
}))
