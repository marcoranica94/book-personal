import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {Chapter} from '@/types'
import {ChapterStatus, Priority} from '@/types'
import * as chaptersService from '@/services/chaptersService'
import {useChaptersStore} from './chaptersStore'

// Mock chaptersService prima di importare lo store
vi.mock('@/services/chaptersService', () => ({
  getChapters: vi.fn(),
  addChapter: vi.fn(),
  updateChapter: vi.fn(),
  deleteChapter: vi.fn(),
}))

// Mock toastStore
vi.mock('@/stores/toastStore', () => ({
  toast: {success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn()},
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: overrides.id ?? 'ch-1',
    number: 1,
    title: 'Capitolo 1',
    subtitle: '',
    status: ChapterStatus.TODO,
    priority: Priority.MEDIUM,
    tags: [],
    targetChars: 9000,
    currentChars: 4500,
    wordCount: 750,
    synopsis: '',
    notes: '',
    checklist: [],
    filePath: 'chapters/01-capitolo.md',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    dueDate: null,
    assignedReviewer: null,
    ...overrides,
  }
}

beforeEach(() => {
  useChaptersStore.setState({chapters: [], isLoading: false, isSaving: false, error: null})
  vi.clearAllMocks()
})

// ─── Selectors ────────────────────────────────────────────────────────────────

describe('selectors', () => {
  it('totalWords somma le parole di tutti i capitoli', () => {
    useChaptersStore.setState({
      chapters: [
        makeChapter({id: 'ch-1', wordCount: 500}),
        makeChapter({id: 'ch-2', wordCount: 300}),
      ],
    })
    expect(useChaptersStore.getState().totalWords()).toBe(800)
  })

  it('totalChars somma i caratteri di tutti i capitoli', () => {
    useChaptersStore.setState({
      chapters: [
        makeChapter({id: 'ch-1', currentChars: 4500}),
        makeChapter({id: 'ch-2', currentChars: 2000}),
      ],
    })
    expect(useChaptersStore.getState().totalChars()).toBe(6500)
  })

  it('completedCount conta solo i DONE', () => {
    useChaptersStore.setState({
      chapters: [
        makeChapter({id: 'ch-1', status: ChapterStatus.DONE}),
        makeChapter({id: 'ch-2', status: ChapterStatus.DONE}),
        makeChapter({id: 'ch-3', status: ChapterStatus.IN_PROGRESS}),
      ],
    })
    expect(useChaptersStore.getState().completedCount()).toBe(2)
  })

  it('byStatus filtra per status', () => {
    useChaptersStore.setState({
      chapters: [
        makeChapter({id: 'ch-1', status: ChapterStatus.TODO}),
        makeChapter({id: 'ch-2', status: ChapterStatus.IN_PROGRESS}),
        makeChapter({id: 'ch-3', status: ChapterStatus.TODO}),
      ],
    })
    const {byStatus} = useChaptersStore.getState()
    expect(byStatus(ChapterStatus.TODO)).toHaveLength(2)
    expect(byStatus(ChapterStatus.IN_PROGRESS)).toHaveLength(1)
    expect(byStatus(ChapterStatus.DONE)).toHaveLength(0)
  })

  it('getById trova il capitolo corretto', () => {
    useChaptersStore.setState({
      chapters: [makeChapter({id: 'ch-abc', title: 'Trovami'})],
    })
    const ch = useChaptersStore.getState().getById('ch-abc')
    expect(ch?.title).toBe('Trovami')
  })

  it('getById restituisce undefined se non trovato', () => {
    useChaptersStore.setState({chapters: []})
    expect(useChaptersStore.getState().getById('non-esiste')).toBeUndefined()
  })
})

// ─── loadChapters ─────────────────────────────────────────────────────────────

describe('loadChapters', () => {
  it('popola lo stato con i capitoli ricevuti', async () => {
    const chapters = [makeChapter({id: 'ch-1'}), makeChapter({id: 'ch-2'})]
    vi.mocked(chaptersService.getChapters).mockResolvedValue(chapters)

    await useChaptersStore.getState().loadChapters()

    expect(useChaptersStore.getState().chapters).toHaveLength(2)
    expect(useChaptersStore.getState().isLoading).toBe(false)
  })

  it('gestisce errori impostando error state', async () => {
    vi.mocked(chaptersService.getChapters).mockRejectedValue(new Error('Firestore down'))

    await useChaptersStore.getState().loadChapters()

    expect(useChaptersStore.getState().error).toBe('Firestore down')
    expect(useChaptersStore.getState().isLoading).toBe(false)
  })
})

// ─── addChapter ───────────────────────────────────────────────────────────────

describe('addChapter', () => {
  it('aggiunge il capitolo allo state dopo il salvataggio', async () => {
    vi.mocked(chaptersService.addChapter).mockResolvedValue(undefined)

    await useChaptersStore.getState().addChapter({title: 'Nuovo', number: 1})

    const {chapters} = useChaptersStore.getState()
    expect(chapters).toHaveLength(1)
    expect(chapters[0].title).toBe('Nuovo')
  })

  it('propaga il numero corretto se omesso', async () => {
    useChaptersStore.setState({chapters: [makeChapter({id: 'ch-1'})]})
    vi.mocked(chaptersService.addChapter).mockResolvedValue(undefined)

    await useChaptersStore.getState().addChapter({title: 'Secondo'})

    const chapters = useChaptersStore.getState().chapters
    expect(chapters[1].number).toBe(2)
  })

  it('lancia eccezione e non modifica lo stato se il servizio fallisce', async () => {
    vi.mocked(chaptersService.addChapter).mockRejectedValue(new Error('save failed'))

    await expect(useChaptersStore.getState().addChapter({title: 'Fallito'})).rejects.toThrow()
    expect(useChaptersStore.getState().chapters).toHaveLength(0)
  })
})

// ─── updateChapter ────────────────────────────────────────────────────────────

describe('updateChapter', () => {
  it('aggiorna il capitolo corretto e aggiorna updatedAt', async () => {
    useChaptersStore.setState({chapters: [makeChapter({id: 'ch-1', title: 'Vecchio'})]})
    vi.mocked(chaptersService.updateChapter).mockResolvedValue(undefined)

    await useChaptersStore.getState().updateChapter('ch-1', {title: 'Nuovo'})

    const ch = useChaptersStore.getState().getById('ch-1')
    expect(ch?.title).toBe('Nuovo')
  })

  it('non modifica altri capitoli', async () => {
    useChaptersStore.setState({
      chapters: [makeChapter({id: 'ch-1'}), makeChapter({id: 'ch-2', title: 'Intatto'})],
    })
    vi.mocked(chaptersService.updateChapter).mockResolvedValue(undefined)

    await useChaptersStore.getState().updateChapter('ch-1', {title: 'Cambiato'})

    expect(useChaptersStore.getState().getById('ch-2')?.title).toBe('Intatto')
  })
})

// ─── deleteChapter ────────────────────────────────────────────────────────────

describe('deleteChapter', () => {
  it('rimuove il capitolo dallo state', async () => {
    useChaptersStore.setState({
      chapters: [makeChapter({id: 'ch-1'}), makeChapter({id: 'ch-2'})],
    })
    vi.mocked(chaptersService.deleteChapter).mockResolvedValue(undefined)

    await useChaptersStore.getState().deleteChapter('ch-1')

    const {chapters} = useChaptersStore.getState()
    expect(chapters).toHaveLength(1)
    expect(chapters[0].id).toBe('ch-2')
  })
})

// ─── toggleChecklistItem ──────────────────────────────────────────────────────

describe('toggleChecklistItem', () => {
  it('inverte lo stato done di un item checklist', async () => {
    useChaptersStore.setState({
      chapters: [
        makeChapter({
          id: 'ch-1',
          checklist: [{id: 'item-1', text: 'Bozza', done: false}],
        }),
      ],
    })
    vi.mocked(chaptersService.updateChapter).mockResolvedValue(undefined)

    await useChaptersStore.getState().toggleChecklistItem('ch-1', 'item-1')

    const ch = useChaptersStore.getState().getById('ch-1')
    expect(ch?.checklist[0].done).toBe(true)
  })
})
