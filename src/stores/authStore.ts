import {create} from 'zustand'
import {getAuthenticatedUser, revokeToken} from '@/services/github'
import {initializeDataBranch} from '@/services/dataService'
import {LS_TOKEN_KEY, LS_USER_KEY} from '@/utils/constants'
import type {GitHubUser} from '@/types'

interface AuthStore {
  token: string | null
  user: GitHubUser | null
  isAuthenticated: boolean
  isLoading: boolean
  isInitializing: boolean  // true while setting up data branch
  setToken: (token: string) => Promise<void>
  logout: () => Promise<void>
  validateToken: () => Promise<boolean>
  initialize: () => Promise<void>
}

async function runDbInit(): Promise<void> {
  try {
    await initializeDataBranch()
  } catch (err) {
    // Non-fatal: branch may already exist or network error — log and continue
    console.warn('[DB init]', (err as Error).message)
  }
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isInitializing: false,

  setToken: async (token: string) => {
    localStorage.setItem(LS_TOKEN_KEY, token)
    set({ token, isLoading: true })
    try {
      const user = await getAuthenticatedUser()
      localStorage.setItem(LS_USER_KEY, JSON.stringify(user))
      set({ user, isAuthenticated: true, isLoading: false, isInitializing: true })
      await runDbInit()
      set({ isInitializing: false })
    } catch {
      localStorage.removeItem(LS_TOKEN_KEY)
      localStorage.removeItem(LS_USER_KEY)
      set({ token: null, user: null, isAuthenticated: false, isLoading: false, isInitializing: false })
    }
  },

  logout: async () => {
    const { token } = get()
    if (token) await revokeToken(token)
    localStorage.removeItem(LS_TOKEN_KEY)
    localStorage.removeItem(LS_USER_KEY)
    localStorage.removeItem('book_db_ready')
    set({ token: null, user: null, isAuthenticated: false, isInitializing: false })
  },

  validateToken: async () => {
    const token = localStorage.getItem(LS_TOKEN_KEY)
    if (!token) {
      set({ isLoading: false })
      return false
    }
    set({ token, isLoading: true })
    try {
      const user = await getAuthenticatedUser()
      localStorage.setItem(LS_USER_KEY, JSON.stringify(user))
      set({ user, isAuthenticated: true, isLoading: false })
      return true
    } catch {
      localStorage.removeItem(LS_TOKEN_KEY)
      localStorage.removeItem(LS_USER_KEY)
      set({ token: null, user: null, isAuthenticated: false, isLoading: false })
      return false
    }
  },

  initialize: async () => {
    const cachedUser = localStorage.getItem(LS_USER_KEY)
    const token = localStorage.getItem(LS_TOKEN_KEY)
    if (token && cachedUser) {
      // Optimistic load from cache
      set({
        token,
        user: JSON.parse(cachedUser) as GitHubUser,
        isAuthenticated: true,
        isLoading: false,
      })
      // Background: validate token + ensure db ready
      Promise.all([
        getAuthenticatedUser().catch(() => {
          localStorage.removeItem(LS_TOKEN_KEY)
          localStorage.removeItem(LS_USER_KEY)
          set({ token: null, user: null, isAuthenticated: false })
        }),
        runDbInit(),
      ])
    } else {
      await get().validateToken()
    }
  },
}))
