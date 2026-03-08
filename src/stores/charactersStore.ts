import {create} from 'zustand'
import {getAllCharacters, saveCharacter, updateCharacter, deleteCharacter} from '@/services/charactersService'
import type {Character} from '@/types'

interface CharactersState {
  characters: Character[]
  isLoading: boolean
  error: string | null
  load: () => Promise<void>
  create: (char: Omit<Character, 'id'>) => Promise<string>
  update: (id: string, updates: Partial<Omit<Character, 'id'>>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useCharactersStore = create<CharactersState>((set, get) => ({
  characters: [],
  isLoading: false,
  error: null,

  load: async () => {
    set({isLoading: true, error: null})
    try {
      const characters = await getAllCharacters()
      set({characters, isLoading: false})
    } catch (err) {
      set({error: (err as Error).message, isLoading: false})
    }
  },

  create: async (char) => {
    const id = await saveCharacter(char)
    await get().load()
    return id
  },

  update: async (id, updates) => {
    await updateCharacter(id, updates)
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === id ? {...c, ...updates, updatedAt: new Date().toISOString()} : c,
      ),
    }))
  },

  remove: async (id) => {
    await deleteCharacter(id)
    set((state) => ({characters: state.characters.filter((c) => c.id !== id)}))
  },
}))
