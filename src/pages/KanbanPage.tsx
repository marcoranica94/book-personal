import { useEffect, useState } from 'react'
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCorners,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { motion } from 'framer-motion'
import { Plus, LayoutGrid, List, Search, X } from 'lucide-react'
import { useChaptersStore } from '@/stores/chaptersStore'
import { useUIStore } from '@/stores/uiStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useDriveStore } from '@/stores/driveStore'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { pullFromDrive } from '@/services/driveSyncService'
import type { Chapter } from '@/types'
import { ChapterStatus } from '@/types'
import { KANBAN_COLUMNS_ORDER } from '@/utils/constants'
import KanbanColumn from '@/components/kanban/KanbanColumn'
import ChapterCard from '@/components/kanban/ChapterCard'
import ChapterModal from '@/components/kanban/ChapterModal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { cn } from '@/utils/cn'

export default function KanbanPage() {
  const { chapters, loadChapters, addChapter, updateChapter, deleteChapter, isLoading } =
    useChaptersStore()
  const { loadSettings } = useSettingsStore()
  const { viewMode, setViewMode, filters, setFilter, clearFilters } = useUIStore()
  const { config: driveConfig, load: loadDrive, patchTokens } = useDriveStore()
  const { user } = useAuthStore()

  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null)
  const [defaultStatus, setDefaultStatus] = useState<ChapterStatus>(ChapterStatus.TODO)
  const [deleteTarget, setDeleteTarget] = useState<Chapter | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    async function init() {
      await loadChapters()
      void loadSettings()
      if (!user) return
      // Carica la config Drive se non è ancora in store (es. primo accesso diretto alla board)
      let config = driveConfig
      if (!config) {
        await loadDrive(user.uid)
        config = useDriveStore.getState().config
      }
      if (config?.folderId) {
        try {
          const currentChapters = useChaptersStore.getState().chapters
          const { result } = await pullFromDrive(config, user.uid, currentChapters, (tokens) =>
            patchTokens(user.uid, tokens),
          )
          if (result.created > 0 || result.updated > 0) {
            await loadChapters()
            const parts: string[] = []
            if (result.created > 0) parts.push(`${result.created} nuov${result.created === 1 ? 'o' : 'i'}`)
            if (result.updated > 0) parts.push(`${result.updated} aggiornat${result.updated === 1 ? 'o' : 'i'}`)
            toast.success(`Drive: ${parts.join(', ')} capitol${result.created + result.updated === 1 ? 'o' : 'i'}`)
          }
          if (result.errors.length > 0) toast.error(`Drive: ${result.errors.length} errori`)
        } catch {
          // sync silenzioso — non blocca la board
        }
      }
    }

    void init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // Filtered chapters
  const filtered = chapters.filter((c) => {
    if (filters.search && !c.title.toLowerCase().includes(filters.search.toLowerCase())) return false
    if (filters.priority && c.priority !== filters.priority) return false
    if (filters.tags.length > 0 && !filters.tags.every((t) => c.tags.includes(t))) return false
    return true
  })

  function getColumnChapters(status: ChapterStatus) {
    return filtered.filter((c) => c.status === status)
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────

  function onDragStart({ active }: DragStartEvent) {
    // Salva lo snapshot ORIGINALE del capitolo (con lo status prima del drag)
    const chapter = useChaptersStore.getState().chapters.find((c) => c.id === active.id)
    setActiveChapter(chapter ?? null)
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return
    const activeId = active.id as string
    const overId = over.id as string

    const current = useChaptersStore.getState().chapters
    const dragged = current.find((c) => c.id === activeId)
    if (!dragged) return

    const overIsColumn = (Object.values(ChapterStatus) as string[]).includes(overId)

    if (overIsColumn) {
      if (dragged.status !== overId) {
        useChaptersStore.setState((s) => ({
          chapters: s.chapters.map((c) =>
            c.id === activeId ? { ...c, status: overId as ChapterStatus } : c
          ),
        }))
      }
    } else {
      const overChapter = current.find((c) => c.id === overId)
      if (overChapter && dragged.status !== overChapter.status) {
        useChaptersStore.setState((s) => ({
          chapters: s.chapters.map((c) =>
            c.id === activeId ? { ...c, status: overChapter.status } : c
          ),
        }))
      }
    }
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    // activeChapter ha lo status ORIGINALE (catturato in onDragStart)
    const originalChapter = activeChapter
    setActiveChapter(null)
    if (!originalChapter) return

    const activeId = active.id as string
    // Legge lo stato CORRENTE dallo store (aggiornato da onDragOver)
    const current = useChaptersStore.getState().chapters
    const currentChapter = current.find((c) => c.id === activeId)
    if (!currentChapter) return

    // Reorder within same column
    if (over) {
      const overId = over.id as string
      const overChapter = current.find((c) => c.id === overId)
      if (overChapter && currentChapter.status === overChapter.status) {
        const colChapters = current.filter((c) => c.status === currentChapter.status)
        const oldIdx = colChapters.findIndex((c) => c.id === activeId)
        const newIdx = colChapters.findIndex((c) => c.id === overId)
        if (oldIdx !== newIdx) {
          const reordered = arrayMove(colChapters, oldIdx, newIdx)
          const others = current.filter((c) => c.status !== currentChapter.status)
          useChaptersStore.setState({ chapters: [...others, ...reordered] })
        }
      }
    }

    // Persist solo se lo status è cambiato rispetto all'originale
    if (originalChapter.status !== currentChapter.status) {
      try {
        await updateChapter(activeId, { status: currentChapter.status })
        toast.success(`Spostato in "${currentChapter.status.replace('_', ' ')}"`)
      } catch {
        // Rollback visivo
        useChaptersStore.setState((s) => ({
          chapters: s.chapters.map((c) =>
            c.id === activeId ? { ...c, status: originalChapter.status } : c
          ),
        }))
        toast.error('Errore nel salvataggio')
      }
    }
  }

  // ── Modal handlers ────────────────────────────────────────────────────────

  function openNewChapter(status: ChapterStatus = ChapterStatus.TODO) {
    setEditingChapter(null)
    setDefaultStatus(status)
    setModalOpen(true)
  }

  function openEditChapter(chapter: Chapter) {
    setEditingChapter(chapter)
    setModalOpen(true)
  }

  async function handleSave(data: Partial<Chapter>) {
    if (editingChapter) {
      await updateChapter(editingChapter.id, data)
      toast.success('Capitolo aggiornato')
    } else {
      await addChapter({ ...data, status: defaultStatus })
      toast.success('Capitolo creato!')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await deleteChapter(deleteTarget.id)
      toast.success('Capitolo eliminato')
      setDeleteTarget(null)
    } catch {
      toast.error('Errore nell\'eliminazione')
    } finally {
      setIsDeleting(false)
    }
  }

  const hasFilters = filters.search || filters.priority || filters.tags.length > 0

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-white/8 px-6 py-3">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
          <input
            className="w-full rounded-lg border border-white/8 bg-white/4 py-1.5 pl-8 pr-3 text-sm text-white placeholder-slate-600 focus:border-violet-500/40 focus:outline-none"
            placeholder="Cerca capitolo..."
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
          />
        </div>

        {/* Clear filters */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 rounded-lg border border-white/8 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-white/5"
          >
            <X className="h-3 w-3" />
            Reset filtri
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-white/8 p-0.5">
            {(['kanban', 'list'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  'rounded-md p-1.5 transition-colors',
                  viewMode === mode ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'
                )}
              >
                {mode === 'kanban' ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
              </button>
            ))}
          </div>

          {/* New chapter button */}
          <button
            onClick={() => openNewChapter()}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-500"
          >
            <Plus className="h-4 w-4" />
            Nuovo capitolo
          </button>
        </div>
      </div>

      {/* Board / List */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          </div>
        ) : viewMode === 'kanban' ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
          >
            <div className="flex gap-5">
              {KANBAN_COLUMNS_ORDER.map((status) => (
                <KanbanColumn
                  key={status}
                  status={status as ChapterStatus}
                  chapters={getColumnChapters(status as ChapterStatus)}
                  onAddChapter={
                    status === ChapterStatus.TODO ? () => openNewChapter(ChapterStatus.TODO) : undefined
                  }
                  onEditChapter={openEditChapter}
                  onDeleteChapter={setDeleteTarget}
                />
              ))}
            </div>

            <DragOverlay>
              {activeChapter && (
                <div className="rotate-1 opacity-90">
                  <ChapterCard
                    chapter={activeChapter}
                    onEdit={() => {}}
                    onDelete={() => {}}
                    isDragging
                  />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        ) : (
          // List view
          <div className="space-y-2 max-w-3xl mx-auto">
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-500">
                Nessun capitolo trovato
              </div>
            ) : (
              filtered
                .sort((a, b) => a.number - b.number)
                .map((chapter) => (
                  <motion.div
                    key={chapter.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-4 rounded-xl border border-white/8 bg-[#12121A] px-4 py-3"
                  >
                    <span className="w-8 shrink-0 text-xs font-medium text-slate-600">
                      {String(chapter.number).padStart(2, '0')}
                    </span>
                    <span className="flex-1 text-sm font-medium text-slate-200">{chapter.title}</span>
                    <span className="text-xs text-slate-500">{chapter.currentChars.toLocaleString('it')} car.</span>
                    <span className={cn(
                      'rounded-full px-2.5 py-0.5 text-xs font-medium',
                      `bg-${chapter.status === ChapterStatus.DONE ? 'emerald' : 'slate'}-900/50`,
                    )}>
                      {chapter.status.replace('_', ' ')}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEditChapter(chapter)}
                        className="rounded-md p-1 text-slate-600 hover:bg-white/8 hover:text-slate-300"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <ChapterModal
        open={modalOpen}
        chapter={editingChapter}
        defaultStatus={defaultStatus}
        onSave={handleSave}
        onClose={() => setModalOpen(false)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Elimina capitolo"
        description={`Sei sicuro di voler eliminare "${deleteTarget?.title}"? L'azione non può essere annullata.`}
        confirmLabel="Elimina"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
