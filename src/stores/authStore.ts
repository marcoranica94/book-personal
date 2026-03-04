import {create} from 'zustand'
import {getAuthenticatedUser, revokeToken} from '@/services/github'
import {LS_TOKEN_KEY, LS_USER_KEY} from '@/utils/constants'
import type {GitHubUser} from '@/types'

interface AuthStore {
  token: string | null
  user: GitHubUser | null
  isAuthenticated: boolean
  isLoading: boolean
  setToken: (token: string) => Promise<void>
  logout: () => Promise<void>
  validateToken: () => Promise<boolean>
  initialize: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setToken: async (token: string) => {
    localStorage.setItem(LS_TOKEN_KEY, token)
    set({ token, isLoading: true })
    try {
      const user = await getAuthenticatedUser()
      localStorage.setItem(LS_USER_KEY, JSON.stringify(user))
      set({ user, isAuthenticated: true, isLoading: false })
    } catch {
      localStorage.removeItem(LS_TOKEN_KEY)
      localStorage.removeItem(LS_USER_KEY)
      set({ token: null, user: null, isAuthenticated: false, isLoading: false })
    }
  },

  logout: async () => {
    const { token } = get()
    if (token) {
      await revokeToken(token)
    }
    localStorage.removeItem(LS_TOKEN_KEY)
    localStorage.removeItem(LS_USER_KEY)
    set({ token: null, user: null, isAuthenticated: false })
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
      // Optimistic load from cache, then validate in background
      set({
        token,
        user: JSON.parse(cachedUser) as GitHubUser,
        isAuthenticated: true,
        isLoading: false,
      })
      // Background validation
      getAuthenticatedUser().catch(() => {
        localStorage.removeItem(LS_TOKEN_KEY)
        localStorage.removeItem(LS_USER_KEY)
        set({ token: null, user: null, isAuthenticated: false })
      })
    } else {
      await get().validateToken()
    }
  },
}))
