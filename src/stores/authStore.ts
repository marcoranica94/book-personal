import {create} from 'zustand'
import type {User} from 'firebase/auth'
import {onAuthChange, signInWithGitHub, signOutUser} from '@/services/authService'
import {ALLOWED_UID} from '@/utils/constants'

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
      if (user && ALLOWED_UID && user.uid !== ALLOWED_UID) {
        // Utente non autorizzato: forza logout immediato
        void signOutUser()
        set({user: null, isAuthenticated: false, isLoading: false})
        return
      }
      set({user, isAuthenticated: !!user, isLoading: false})
    })
  },
}))
