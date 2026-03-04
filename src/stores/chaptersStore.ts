import {create} from 'zustand'
import {v4 as uuidv4} from 'uuid'
import * as dataService from '@/services/dataService'
import type {Chapter, ChecklistItem} from '@/types'
import {ChapterStatus, DEFAULT_CHECKLIST, Priority} from '@/types'

interface ChaptersStore {
  chapters: Chapter[]
  isLoading: boolean
  isSaving: boolean
  error: string | null
  lastSync: string | null

  loadChapters: () => Promise<void>
  addChapter: (data: Partial<Chapter>) => Promise<void>
  updateChapter: (id: string, updates: Partial<Chapter>) => Promise<void>
  deleteChapter: (id: string) => Promise<void>
  moveChapter: (id: string, newStatus: ChapterStatus) => Promise<void>
  toggleChecklistItem: (chapterId: string, itemId: string) => Promise<void>
  reorderChecklist: (chapterId: string, items: ChecklistItem[]) => Promise<void>

  byStatus: (status: ChapterStatus) => Chapter[]
  getById: (id: string) => Chapter | undefined
  totalWords: () => number
  totalChars: () => number
  completedCount: () => number
}

function createDefaultChapter(data: Partial<Chapter>, existingCount: number): Chapter {
  const now = new Date().toISOString()
  const id = data.id ?? uuidv4()
  const number = data.number ?? existingCount + 1
  return {
    id,
    number,
    title: data.title ?? `Capitolo ${number}`,
    subtitle: data.subtitle ?? '',
    status: data.status ?? ChapterStatus.TODO,
    priority: data.priority ?? Priority.MEDIUM,
    tags: data.tags ?? [],
    targetChars: data.targetChars ?? 9000,
    currentChars: data.currentChars ?? 0,
    wordCount: data.wordCount ?? 0,
    synopsis: data.synopsis ?? '',
    notes: data.notes ?? '',
    checklist:
      data.checklist ?? DEFAULT_CHECKLIST.map((item) => ({ ...item, id: uuidv4() })),
    filePath:
      data.filePath ??
      `chapters/${String(number).padStart(2, '0')}-capitolo.md`,
    createdAt: data.createdAt ?? now,
    updatedAt: now,
    dueDate: data.dueDate ?? null,
    assignedReviewer: data.assignedReviewer ?? null,
  }
}

export const useChaptersStore = create<ChaptersStore>((set, get) => ({
  chapters: [],
  isLoading: false,
  isSaving: false,
  error: null,
  lastSync: null,

  loadChapters: async () => {
    set({ isLoading: true, error: null })
    try {
      const chapters = await dataService.getAllChapters()
      set({ chapters, isLoading: false, lastSync: new Date().toISOString() })
    } catch (err) {
      set({ isLoading: false, error: (err as Error).message })
    }
  },

  addChapter: async (data) => {
    const { chapters } = get()
    const chapter = createDefaultChapter(data, chapters.length)
    set({ isSaving: true })
    try {
      await dataService.addChapter(chapter)
      set((s) => ({ chapters: [...s.chapters, chapter], isSaving: false }))
    } catch (err) {
      set({ isSaving: false, error: (err as Error).message })
    }
  },

  updateChapter: async (id, updates) => {
    set({ isSaving: true })
    try {
      await dataService.updateChapter(id, updates)
      set((s) => ({
        chapters: s.chapters.map((c) =>
          c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
        ),
        isSaving: false,
      }))
    } catch (err) {
      set({ isSaving: false, error: (err as Error).message })
    }
  },

  deleteChapter: async (id) => {
    set({ isSaving: true })
    try {
      await dataService.deleteChapter(id)
      set((s) => ({
        chapters: s.chapters.filter((c) => c.id !== id),
        isSaving: false,
      }))
    } catch (err) {
      set({ isSaving: false, error: (err as Error).message })
    }
  },

  moveChapter: async (id, newStatus) => {
    await get().updateChapter(id, { status: newStatus })
  },

  toggleChecklistItem: async (chapterId, itemId) => {
    const chapter = get().chapters.find((c) => c.id === chapterId)
    if (!chapter) return
    const checklist = chapter.checklist.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    )
    await get().updateChapter(chapterId, { checklist })
  },

  reorderChecklist: async (chapterId, items) => {
    await get().updateChapter(chapterId, { checklist: items })
  },

  byStatus: (status) => get().chapters.filter((c) => c.status === status),
  getById: (id) => get().chapters.find((c) => c.id === id),
  totalWords: () => get().chapters.reduce((sum, c) => sum + c.wordCount, 0),
  totalChars: () => get().chapters.reduce((sum, c) => sum + c.currentChars, 0),
  completedCount: () =>
    get().chapters.filter((c) => c.status === ChapterStatus.DONE).length,
}))
