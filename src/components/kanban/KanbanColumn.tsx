import {useDroppable} from '@dnd-kit/core'
import {SortableContext, verticalListSortingStrategy} from '@dnd-kit/sortable'
import {motion} from 'framer-motion'
import {BookOpen, Plus} from 'lucide-react'
import type {Chapter, ChapterStatus} from '@/types'
import {STATUS_CONFIG} from '@/types'
import ChapterCard from './ChapterCard'
import EmptyState from '@/components/ui/EmptyState'
import {cn} from '@/utils/cn'

interface KanbanColumnProps {
  status: ChapterStatus
  chapters: Chapter[]
  onAddChapter?: () => void
  onEditChapter: (chapter: Chapter) => void
  onDeleteChapter: (chapter: Chapter) => void
}

export default function KanbanColumn({
  status,
  chapters,
  onAddChapter,
  onEditChapter,
  onDeleteChapter,
}: KanbanColumnProps) {
  const config = STATUS_CONFIG[status]
  const { setNodeRef, isOver } = useDroppable({ id: status })

  const accentColors: Record<ChapterStatus, string> = {
    TODO: 'bg-slate-500',
    IN_PROGRESS: 'bg-blue-500',
    REVIEW: 'bg-amber-500',
    EXTERNAL_REVIEW: 'bg-violet-500',
    REFINEMENT: 'bg-cyan-500',
    DONE: 'bg-emerald-500',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex w-72 shrink-0 flex-col"
    >
      {/* Column header */}
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', accentColors[status])} />
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {config.label}
          </span>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--overlay)] text-xs font-medium text-slate-500">
            {chapters.length}
          </span>
        </div>
        {onAddChapter && (
          <button
            onClick={onAddChapter}
            className="rounded-lg p-1 text-slate-600 transition-colors hover:bg-[var(--overlay)] hover:text-slate-300"
            title="Aggiungi capitolo"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 rounded-xl border border-dashed p-2 transition-colors',
          isOver
            ? 'border-violet-500/50 bg-violet-500/5'
            : 'border-[var(--border)] bg-[var(--overlay)]'
        )}
      >
        <SortableContext items={chapters.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {chapters.map((chapter) => (
              <ChapterCard
                key={chapter.id}
                chapter={chapter}
                onEdit={onEditChapter}
                onDelete={onDeleteChapter}
              />
            ))}
          </div>
        </SortableContext>

        {chapters.length === 0 && (
          <EmptyState
            icon={BookOpen}
            title="Nessun capitolo"
            description="Trascina qui un capitolo"
            className="py-8"
          />
        )}
      </div>
    </motion.div>
  )
}
