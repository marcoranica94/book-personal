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

// Variabili CSS da sovrascrivere in light mode tramite inline style (priorità massima)
const LIGHT_VARS: Record<string, string> = {
  '--bg-base': '#F4F4F8',
  '--bg-sidebar': '#EEEEF4',
  '--bg-card': '#FFFFFF',
  '--bg-elevated': '#F9F9FC',
  '--text-primary': '#111118',
  '--border': 'rgba(0,0,0,0.09)',
  '--border-strong': 'rgba(0,0,0,0.18)',
  '--overlay': 'rgba(0,0,0,0.04)',
  '--chart-axis': '#94A3B8',
  '--chart-grid': 'rgba(0,0,0,0.06)',
  '--chart-tooltip': '#FFFFFF',
  '--color-slate-200': '#8599B0',
  '--color-slate-300': '#6B7F96',
  '--color-slate-400': '#516070',
  '--color-slate-500': '#3D4F5F',
  '--color-slate-600': '#2E3D4A',
  '--color-violet-300': '#6D28D9',
  '--color-violet-400': '#5B21B6',
  '--color-emerald-300': '#047857',
  '--color-emerald-400': '#065F46',
  '--color-amber-300': '#B45309',
  '--color-amber-400': '#92400E',
  '--color-red-300': '#B91C1C',
  '--color-red-400': '#991B1B',
  '--color-cyan-300': '#0E7490',
  '--color-cyan-400': '#0E6780',
  '--color-blue-300': '#1D4ED8',
  '--color-blue-400': '#1E40AF',
  '--color-amber-800': '#FDE68A',
  '--color-amber-900': '#FEF3C7',
  '--color-red-800': '#FECACA',
  '--color-red-900': '#FEE2E2',
  '--color-red-950': '#FFF1F1',
  '--color-emerald-800': '#A7F3D0',
  '--color-emerald-900': '#D1FAE5',
  '--color-emerald-950': '#ECFDF5',
  '--color-violet-800': '#DDD6FE',
  '--color-violet-900': '#EDE9FE',
  '--color-blue-800': '#BFDBFE',
  '--color-blue-900': '#DBEAFE',
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  if (theme === 'light') {
    for (const [k, v] of Object.entries(LIGHT_VARS)) root.style.setProperty(k, v)
  } else {
    for (const k of Object.keys(LIGHT_VARS)) root.style.removeProperty(k)
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
