import {create} from 'zustand'
import {checkCharacterAnalysisAfter, getCharacterAnalysis} from '@/services/characterAnalysisService'
import type {AIProvider, CharacterAnalysis} from '@/types'

type AnalysisMap = Partial<Record<string, Partial<Record<AIProvider, CharacterAnalysis | null>>>>

interface CharacterAnalysisState {
  analyses: AnalysisMap
  isLoading: boolean
  load: (characterId: string, provider: AIProvider) => Promise<void>
  poll: (characterId: string, provider: AIProvider, after: string) => Promise<CharacterAnalysis | null>
}

export const useCharacterAnalysisStore = create<CharacterAnalysisState>((set) => ({
  analyses: {},
  isLoading: false,

  load: async (characterId, provider) => {
    set({isLoading: true})
    try {
      const analysis = await getCharacterAnalysis(characterId, provider)
      set((state) => ({
        isLoading: false,
        analyses: {
          ...state.analyses,
          [characterId]: {...(state.analyses[characterId] ?? {}), [provider]: analysis},
        },
      }))
    } catch {
      set({isLoading: false})
    }
  },

  poll: async (characterId, provider, after) => {
    const result = await checkCharacterAnalysisAfter(characterId, provider, after)
    if (result) {
      set((state) => ({
        analyses: {
          ...state.analyses,
          [characterId]: {...(state.analyses[characterId] ?? {}), [provider]: result},
        },
      }))
    }
    return result
  },
}))
