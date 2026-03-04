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
}

const defaultFilters: KanbanFilters = {
  search: '',
  priority: null,
  tags: [],
}

export const useUIStore = create<UIStore>((set) => ({
  viewMode: 'kanban',
  theme: 'dark',
  sidebarCollapsed: false,
  filters: defaultFilters,
  lastSavedAt: null,

  setViewMode: (mode) => set({ viewMode: mode }),

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),

  clearFilters: () => set({ filters: defaultFilters }),

  setLastSaved: () => set({ lastSavedAt: new Date().toISOString() }),
}))
