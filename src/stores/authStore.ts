import {create} from 'zustand'
import type {User} from 'firebase/auth'
import {onAuthChange, signInWithGitHub, signOutUser} from '@/services/authService'

interface AuthStore {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  signIn: () => Promise<void>
  logout: () => Promise<void>
  initialize: () => () => void // restituisce la funzione unsubscribe
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  signIn: async () => {
    const user = await signInWithGitHub()
    set({user, isAuthenticated: true})
  },

  logout: async () => {
    await signOutUser()
    set({user: null, isAuthenticated: false})
  },

  initialize: () => {
    return onAuthChange((user) => {
      set({user, isAuthenticated: !!user, isLoading: false})
    })
  },
}))
