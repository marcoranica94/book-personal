import { create } from 'zustand'
import type { DriveConfig, DriveTokens } from '@/types'
import { deleteDriveConfig, getDriveConfig, saveDriveConfig, updateDriveFolder, updateDriveTokens } from '@/services/driveConfigService'
import { initiateDriveOAuth } from '@/services/driveAuthService'

interface DriveState {
  config: DriveConfig | null
  isConnected: boolean
  isLoading: boolean

  load: (uid: string) => Promise<void>
  connect: () => Promise<void>
  disconnect: (uid: string) => Promise<void>
  saveInitialConfig: (uid: string, tokens: DriveTokens) => Promise<void>
  setFolder: (uid: string, folderId: string, folderName: string) => Promise<void>
  patchTokens: (uid: string, tokens: DriveTokens) => Promise<void>
}

export const useDriveStore = create<DriveState>((set, get) => ({
  config: null,
  isConnected: false,
  isLoading: false,

  load: async (uid) => {
    set({ isLoading: true })
    try {
      const config = await getDriveConfig(uid)
      set({ config, isConnected: !!config })
    } finally {
      set({ isLoading: false })
    }
  },

  connect: async () => {
    await initiateDriveOAuth()
    // page redirects — no code after this
  },

  disconnect: async (uid) => {
    await deleteDriveConfig(uid)
    set({ config: null, isConnected: false })
  },

  saveInitialConfig: async (uid, tokens) => {
    const now = new Date().toISOString()
    const config: Omit<DriveConfig, 'uid'> = {
      folderId: '',
      folderName: '',
      tokens,
      createdAt: now,
      updatedAt: now,
    }
    await saveDriveConfig(uid, config)
    set({ config: { ...config, uid }, isConnected: true })
  },

  setFolder: async (uid, folderId, folderName) => {
    await updateDriveFolder(uid, folderId, folderName)
    const current = get().config
    if (current) {
      set({ config: { ...current, folderId, folderName, updatedAt: new Date().toISOString() } })
    }
  },

  patchTokens: async (uid, tokens) => {
    await updateDriveTokens(uid, tokens)
    const current = get().config
    if (current) {
      set({ config: { ...current, tokens, updatedAt: new Date().toISOString() } })
    }
  },
}))
