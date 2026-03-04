import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion } from 'framer-motion'
import { GripVertical, Calendar, FileText, CheckSquare, Tag, Pencil, Trash2, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Chapter } from '@/types'
import { PRIORITY_CONFIG } from '@/types'
import { charsToPages, calcProgress, formatDate, isDueSoon, isOverdue } from '@/utils/formatters'
import { cn } from '@/utils/cn'

interface ChapterCardProps {
  chapter: Chapter
  onEdit: (chapter: Chapter) => void
  onDelete: (chapter: Chapter) => void
  isDragging?: boolean
}

export default function ChapterCard({ chapter, onEdit, onDelete, isDragging }: ChapterCardProps) {
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

  return (
    <div ref={setNodeRef} style={style} className={cn('group', isBeingDragged && 'opacity-40')}>
      <motion.div
        whileHover={{ y: -1 }}
        className={cn(
          'relative rounded-xl border bg-[#12121A] p-4 shadow-sm transition-shadow',
          'border-white/8 hover:border-white/15 hover:shadow-lg hover:shadow-black/30',
          isDragging && 'shadow-2xl ring-1 ring-violet-500/40'
        )}
      >
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="absolute left-2 top-1/2 -translate-y-1/2 cursor-grab p-1 opacity-0 transition-opacity group-hover:opacity-40 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4 text-slate-500" />
        </div>

        {/* Actions */}
        <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Link
            to={`/chapters/${chapter.id}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-white/8 hover:text-violet-400"
            title="Apri dettaglio"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(chapter) }}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-white/8 hover:text-slate-300"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(chapter) }}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-red-900/30 hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="pl-3">
          {/* Chapter number + priority */}
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600">
              Cap. {String(chapter.number).padStart(2, '0')}
            </span>
            <span className={cn('flex items-center gap-1 text-xs font-medium', prio.color)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', prio.dot)} />
              {prio.label}
            </span>
          </div>

          {/* Title */}
          <h3 className="mb-3 line-clamp-2 text-sm font-semibold leading-snug text-slate-100">
            {chapter.title}
          </h3>

          {/* Progress bar */}
          <div className="mb-3">
            <div className="mb-1 flex justify-between text-xs text-slate-600">
              <span>{chapter.currentChars.toLocaleString('it')} car.</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/8">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  progress >= 100
                    ? 'bg-emerald-500'
                    : progress >= 50
                    ? 'bg-violet-500'
                    : 'bg-slate-600'
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500">
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
                  className="flex items-center gap-1 rounded-full bg-white/6 px-2 py-0.5 text-xs text-slate-400"
                >
                  <Tag className="h-2.5 w-2.5" />
                  {tag}
                </span>
              ))}
              {chapter.tags.length > 3 && (
                <span className="rounded-full bg-white/6 px-2 py-0.5 text-xs text-slate-500">
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
