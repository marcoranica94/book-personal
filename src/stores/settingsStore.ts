import {create} from 'zustand'
import * as dataService from '@/services/dataService'
import type {BookSettings} from '@/types'
import {DEFAULT_BOOK_SETTINGS} from '@/types'

interface SettingsStore {
  settings: BookSettings
  isLoading: boolean
  isSaving: boolean
  error: string | null

  loadSettings: () => Promise<void>
  saveSettings: (settings: BookSettings) => Promise<void>
  updateSetting: <K extends keyof BookSettings>(key: K, value: BookSettings[K]) => void
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: DEFAULT_BOOK_SETTINGS,
  isLoading: false,
  isSaving: false,
  error: null,

  loadSettings: async () => {
    set({ isLoading: true, error: null })
    try {
      const settings = await dataService.getSettings()
      set({ settings, isLoading: false })
    } catch (err) {
      set({ isLoading: false, error: (err as Error).message })
    }
  },

  saveSettings: async (settings) => {
    set({ isSaving: true })
    try {
      await dataService.saveSettings(settings)
      set({ settings, isSaving: false })
    } catch (err) {
      set({ isSaving: false, error: (err as Error).message })
    }
  },

  updateSetting: (key, value) => {
    set((s) => ({ settings: { ...s.settings, [key]: value } }))
  },
}))
