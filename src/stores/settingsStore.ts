import {create} from 'zustand'
import * as settingsService from '@/services/settingsService'
import type {BookSettings} from '@/types'
import {DEFAULT_BOOK_SETTINGS} from '@/types'
import {toast} from '@/stores/toastStore'
import {setStoredPat} from '@/services/githubWorkflow'

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
    set({isLoading: true, error: null})
    try {
      const settings = await settingsService.getSettings()
      // Sincronizza PAT da Firestore a localStorage per uso immediato
      if (settings.githubPat) setStoredPat(settings.githubPat)
      set({settings, isLoading: false})
    } catch (err) {
      const msg = (err as Error).message
      set({isLoading: false, error: msg})
      toast.error('Errore caricamento impostazioni: ' + msg)
    }
  },

  saveSettings: async (settings) => {
    set({isSaving: true})
    try {
      await settingsService.saveSettings(settings)
      set({settings, isSaving: false})
    } catch (err) {
      const msg = (err as Error).message
      set({isSaving: false, error: msg})
      toast.error('Errore salvataggio impostazioni: ' + msg)
      throw err
    }
  },

  updateSetting: (key, value) => {
    set((s) => ({settings: {...s.settings, [key]: value}}))
  },
}))
