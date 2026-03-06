import {useSortable} from '@dnd-kit/sortable'
import {CSS} from '@dnd-kit/utilities'
import {motion} from 'framer-motion'
import {Calendar, CheckCircle2, CheckSquare, ExternalLink, FileText, Pencil, Tag, Trash2} from 'lucide-react'
import SyncStatusBadge from '@/components/drive/SyncStatusBadge'
import {Link} from 'react-router-dom'
import type {Chapter} from '@/types'
import {ChapterStatus, PRIORITY_CONFIG} from '@/types'
import {calcProgress, charsToPages, formatDate, isDueSoon, isOverdue} from '@/utils/formatters'
import {cn} from '@/utils/cn'

interface ChapterCardProps {
  chapter: Chapter
  onEdit: (chapter: Chapter) => void
  onDelete: (chapter: Chapter) => void
  isDragging?: boolean
  index?: number
}

export default function ChapterCard({ chapter, onEdit, onDelete, isDragging, index = 0 }: ChapterCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, active } = useSortable({
    id: chapter.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const isBeingDragged = active?.id === chapter.id
  const checklistDone = chapter.checklist.filter((i) => i.done).length
  const checklistTotal = chapter.checklist.length
  const progress = calcProgress(chapter.currentChars, chapter.targetChars)
  const pages = charsToPages(chapter.currentChars)
  const prio = PRIORITY_CONFIG[chapter.priority]
  const overdue = isOverdue(chapter.dueDate)
  const dueSoon = isDueSoon(chapter.dueDate)
  const isDone = chapter.status === ChapterStatus.DONE

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn('group cursor-grab active:cursor-grabbing', isBeingDragged && 'opacity-40')}
    >
      <motion.div
        initial={{opacity: 0, y: 8}}
        animate={{opacity: 1, y: 0}}
        transition={{duration: 0.22, delay: Math.min(index * 0.04, 0.3), ease: 'easeOut'}}
        whileHover={{y: -2, boxShadow: '0 8px 24px rgba(0,0,0,0.35)'}}
        onDoubleClick={(e) => { e.stopPropagation(); onEdit(chapter) }}
        className={cn(
          'relative rounded-xl border bg-[var(--bg-card)] p-4 shadow-sm transition-shadow',
          'border-[var(--border)] hover:border-[var(--border-strong)] hover:shadow-lg hover:shadow-black/30',
          isDragging && 'shadow-2xl ring-1 ring-violet-500/40',
          isDone && 'border-emerald-700/50 ring-1 ring-emerald-500/20'
        )}
      >
        {/* Done badge */}
        {isDone && (
          <div className="absolute -top-2.5 left-3 flex items-center gap-1 rounded-full border border-emerald-700/50 bg-emerald-900/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 shadow-sm backdrop-blur-sm">
            <CheckCircle2 className="h-3 w-3" />
            Completato
          </div>
        )}
        {/* Actions — stopPropagation su pointerDown per non triggerare il drag */}
        <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Link
            to={`/chapters/${chapter.id}`}
            onPointerDown={(e) => e.stopPropagation()}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-[var(--overlay)] hover:text-violet-400"
            title="Apri dettaglio"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onEdit(chapter)}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-[var(--overlay)] hover:text-slate-300"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDelete(chapter)}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-red-900/30 hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div>
          {/* Priority */}
          <div className="mb-2 flex items-center gap-2">
            <span className={cn('flex items-center gap-1 text-xs font-medium', prio.color)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', prio.dot)} />
              {prio.label}
            </span>
          </div>

          {/* Title */}
          <h3 className="mb-3 line-clamp-2 text-sm font-semibold leading-snug text-[var(--text-primary)]">
            {chapter.title}
          </h3>

          {/* Progress bar */}
          <div className="mb-3">
            <div className="mb-1 flex justify-between text-xs text-slate-600">
              <span>{chapter.currentChars.toLocaleString('it')} car.</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-[var(--overlay)]">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  isDone
                    ? 'bg-emerald-500'
                    : progress >= 100
                    ? 'bg-emerald-500'
                    : progress >= 50
                    ? 'bg-violet-500'
                    : 'bg-slate-600'
                )}
                style={{ width: isDone ? '100%' : `${progress}%` }}
              />
            </div>
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500">
            {/* Sync status */}
            {chapter.syncStatus && (
              <SyncStatusBadge status={chapter.syncStatus} error={chapter.syncError} />
            )}
            {/* Pages */}
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {pages}p
            </span>

            {/* Checklist */}
            {checklistTotal > 0 && (
              <span className={cn(
                'flex items-center gap-1',
                checklistDone === checklistTotal && 'text-emerald-500'
              )}>
                <CheckSquare className="h-3 w-3" />
                {checklistDone}/{checklistTotal}
              </span>
            )}

            {/* Due date */}
            {chapter.dueDate && (
              <span className={cn(
                'flex items-center gap-1',
                overdue ? 'text-red-400' : dueSoon ? 'text-amber-400' : 'text-slate-500'
              )}>
                <Calendar className="h-3 w-3" />
                {formatDate(chapter.dueDate, 'dd/MM')}
              </span>
            )}
          </div>

          {/* Tags */}
          {chapter.tags.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {chapter.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-full bg-[var(--overlay)] px-2 py-0.5 text-xs text-slate-400"
                >
                  <Tag className="h-2.5 w-2.5" />
                  {tag}
                </span>
              ))}
              {chapter.tags.length > 3 && (
                <span className="rounded-full bg-[var(--overlay)] px-2 py-0.5 text-xs text-slate-500">
                  +{chapter.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
