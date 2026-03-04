import {create} from 'zustand'
import * as dataService from '@/services/dataService'
import type {ChapterAnalysis} from '@/types'

interface AnalysisStore {
  analyses: Record<string, ChapterAnalysis>
  isLoading: boolean
  error: string | null

  loadAnalysis: (chapterId: string) => Promise<void>
  loadAllAnalyses: (chapterIds: string[]) => Promise<void>
  getAnalysis: (chapterId: string) => ChapterAnalysis | null
}

export const useAnalysisStore = create<AnalysisStore>((set, get) => ({
  analyses: {},
  isLoading: false,
  error: null,

  loadAnalysis: async (chapterId) => {
    set({ isLoading: true })
    try {
      const analysis = await dataService.getChapterAnalysis(chapterId)
      if (analysis) {
        set((s) => ({
          analyses: { ...s.analyses, [chapterId]: analysis },
          isLoading: false,
        }))
      } else {
        set({ isLoading: false })
      }
    } catch (err) {
      set({ isLoading: false, error: (err as Error).message })
    }
  },

  loadAllAnalyses: async (chapterIds) => {
    set({ isLoading: true })
    const results = await Promise.allSettled(
      chapterIds.map((id) => dataService.getChapterAnalysis(id))
    )
    const analyses: Record<string, ChapterAnalysis> = { ...get().analyses }
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value) {
        analyses[chapterIds[i]] = result.value
      }
    })
    set({ analyses, isLoading: false })
  },

  getAnalysis: (chapterId) => get().analyses[chapterId] ?? null,
}))
