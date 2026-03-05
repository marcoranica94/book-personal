import {create} from 'zustand'
import type {KanbanFilters, Priority, Theme, ViewMode} from '@/types'

interface UIStore {
  viewMode: ViewMode
  theme: Theme
  sidebarCollapsed: boolean
  filters: KanbanFilters
  lastSavedAt: string | null

  setViewMode: (mode: ViewMode) => void
  toggleSidebar: () => void
  setFilter: (key: keyof KanbanFilters, value: string | Priority | string[] | null) => void
  clearFilters: () => void
  setLastSaved: () => void
  setTheme: (t: Theme) => void
  toggleTheme: () => void
}

const defaultFilters: KanbanFilters = {
  search: '',
  priority: null,
  tags: [],
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'light') {
    root.setAttribute('data-theme', 'light')
  } else {
    root.removeAttribute('data-theme')
  }
}

const storedTheme = (localStorage.getItem('book-theme') as Theme | null) ?? 'dark'
applyTheme(storedTheme)

export const useUIStore = create<UIStore>((set, get) => ({
  viewMode: 'kanban',
  theme: storedTheme,
  sidebarCollapsed: false,
  filters: defaultFilters,
  lastSavedAt: null,

  setViewMode: (mode) => set({ viewMode: mode }),

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),

  clearFilters: () => set({ filters: defaultFilters }),

  setLastSaved: () => set({ lastSavedAt: new Date().toISOString() }),

  setTheme: (theme) => {
    localStorage.setItem('book-theme', theme)
    applyTheme(theme)
    set({ theme })
  },

  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('book-theme', next)
    applyTheme(next)
    set({ theme: next })
  },
}))
