import {create} from 'zustand'
import * as dataService from '@/services/dataService'
import type {BookSettings} from '@/types'
import {DEFAULT_BOOK_SETTINGS} from '@/types'
import {toast} from '@/stores/toastStore'

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
      const msg = (err as Error).message
      set({ isLoading: false, error: msg })
      toast.error('Errore caricamento impostazioni: ' + msg)
    }
  },

  saveSettings: async (settings) => {
    set({ isSaving: true })
    try {
      await dataService.saveSettings(settings)
      set({ settings, isSaving: false })
    } catch (err) {
      const msg = (err as Error).message
      set({ isSaving: false, error: msg })
      toast.error('Errore salvataggio impostazioni: ' + msg)
      throw err
    }
  },

  updateSetting: (key, value) => {
    set((s) => ({ settings: { ...s.settings, [key]: value } }))
  },
}))
