import {useEffect, useRef, useState} from 'react'
import {AnimatePresence, motion} from 'framer-motion'
import {GripVertical, Loader2, Plus, Trash2, X} from 'lucide-react'
import {v4 as uuidv4} from 'uuid'
import type {Chapter, ChecklistItem} from '@/types'
import {ChapterStatus, DEFAULT_CHECKLIST, Priority, PRIORITY_CONFIG} from '@/types'
import {cn} from '@/utils/cn'

interface ChapterModalProps {
  open: boolean
  chapter?: Chapter | null
  defaultStatus?: ChapterStatus
  onSave: (data: Partial<Chapter>) => Promise<void>
  onClose: () => void
}

const inputCls =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-slate-600 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/30 transition-colors'

export default function ChapterModal({
  open,
  chapter,
  defaultStatus = ChapterStatus.TODO,
  onSave,
  onClose,
}: ChapterModalProps) {
  const isEdit = !!chapter
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [synopsis, setSynopsis] = useState('')
  const [notes, setNotes] = useState('')
  const [targetChars, setTargetChars] = useState(9000)
  const [currentChars, setCurrentChars] = useState(0)
  const [wordCount, setWordCount] = useState(0)
  const [priority, setPriority] = useState<Priority>(Priority.MEDIUM)
  const [status, setStatus] = useState<ChapterStatus>(defaultStatus)
  const [dueDate, setDueDate] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [newItemText, setNewItemText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  // Populate form when editing
  useEffect(() => {
    if (open) {
      if (chapter) {
        setTitle(chapter.title)
        setSubtitle(chapter.subtitle)
        setSynopsis(chapter.synopsis)
        setNotes(chapter.notes)
        setTargetChars(chapter.targetChars)
        setCurrentChars(chapter.currentChars)
        setWordCount(chapter.wordCount)
        setPriority(chapter.priority)
        setStatus(chapter.status)
        setDueDate(chapter.dueDate ? chapter.dueDate.split('T')[0] : '')
        setTags(chapter.tags)
        setChecklist(chapter.checklist)
      } else {
        setTitle('')
        setSubtitle('')
        setSynopsis('')
        setNotes('')
        setTargetChars(9000)
        setCurrentChars(0)
        setWordCount(0)
        setPriority(Priority.MEDIUM)
        setStatus(defaultStatus)
        setDueDate('')
        setTags([])
        setChecklist(DEFAULT_CHECKLIST.map((i) => ({ ...i, id: uuidv4() })))
        setNewItemText('')
      }
      setError('')
      setTimeout(() => titleRef.current?.focus(), 100)
    }
  }, [open, chapter, defaultStatus])

  function addTag() {
    const t = tagInput.trim().toLowerCase()
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t])
    setTagInput('')
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag))
  }

  function addChecklistItem() {
    const text = newItemText.trim()
    if (!text) return
    setChecklist((prev) => [...prev, { id: uuidv4(), text, done: false }])
    setNewItemText('')
  }

  function removeChecklistItem(id: string) {
    setChecklist((prev) => prev.filter((i) => i.id !== id))
  }

  function toggleChecklistItem(id: string) {
    setChecklist((prev) =>
      prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i))
    )
  }

  async function handleSave() {
    if (!title.trim()) { setError('Il titolo è obbligatorio'); return }
    setIsSaving(true)
    setError('')
    try {
      await onSave({
        title: title.trim(),
        subtitle: subtitle.trim(),
        synopsis: synopsis.trim(),
        notes: notes.trim(),
        targetChars,
        currentChars,
        wordCount,
        priority,
        status,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        tags,
        checklist,
      })
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {isEdit ? 'Modifica capitolo' : 'Nuovo capitolo'}
              </h2>
              <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-[var(--overlay)] hover:text-slate-300">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
              <div className="space-y-5">

                {/* Title + subtitle */}
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">Titolo *</label>
                    <input
                      ref={titleRef}
                      className={inputCls}
                      placeholder="Titolo del capitolo"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">Sottotitolo</label>
                    <input
                      className={inputCls}
                      placeholder="Sottotitolo opzionale"
                      value={subtitle}
                      onChange={(e) => setSubtitle(e.target.value)}
                    />
                  </div>
                </div>

                {/* Status + Priority */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">Stato</label>
                    <select
                      className={cn(inputCls, 'cursor-pointer')}
                      value={status}
                      onChange={(e) => setStatus(e.target.value as ChapterStatus)}
                    >
                      {Object.values(ChapterStatus).map((s) => (
                        <option key={s} value={s} className="bg-[var(--bg-elevated)]">
                          {s.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">Priorità</label>
                    <select
                      className={cn(inputCls, 'cursor-pointer')}
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as Priority)}
                    >
                      {Object.values(Priority).map((p) => (
                        <option key={p} value={p} className="bg-[var(--bg-elevated)]">
                          {PRIORITY_CONFIG[p].label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Chars + Words + Due date */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">Caratteri scritti</label>
                    <input
                      type="number"
                      className={inputCls}
                      value={currentChars}
                      onChange={(e) => setCurrentChars(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">Target caratteri</label>
                    <input
                      type="number"
                      className={inputCls}
                      value={targetChars}
                      onChange={(e) => setTargetChars(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">Parole</label>
                    <input
                      type="number"
                      className={inputCls}
                      value={wordCount}
                      onChange={(e) => setWordCount(Number(e.target.value))}
                    />
                  </div>
                </div>

                {/* Due date */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">Scadenza</label>
                    <input
                      type="date"
                      className={cn(inputCls, 'cursor-pointer')}
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Tag</label>
                  <div className="flex gap-2">
                    <input
                      className={cn(inputCls, 'flex-1')}
                      placeholder="Aggiungi tag e premi Invio"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    />
                    <button
                      type="button"
                      onClick={addTag}
                      className="rounded-lg border border-[var(--border)] px-3 text-slate-400 hover:bg-[var(--overlay)] hover:text-slate-200"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  {tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="flex items-center gap-1 rounded-full bg-violet-900/30 px-2.5 py-1 text-xs text-violet-300"
                        >
                          {tag}
                          <button onClick={() => removeTag(tag)} className="hover:text-red-400">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Synopsis */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Synopsis</label>
                  <textarea
                    className={cn(inputCls, 'min-h-[80px] resize-y')}
                    placeholder="Breve sintesi della scena o del capitolo..."
                    value={synopsis}
                    onChange={(e) => setSynopsis(e.target.value)}
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Note interne</label>
                  <textarea
                    className={cn(inputCls, 'min-h-[60px] resize-y')}
                    placeholder="Appunti, idee, riferimenti..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                {/* Checklist */}
                <div>
                  <label className="mb-2 block text-xs font-medium text-slate-400">
                    Checklist ({checklist.filter((i) => i.done).length}/{checklist.length})
                  </label>
                  <div className="space-y-1.5 rounded-xl border border-[var(--border)] bg-[var(--overlay)] p-3">
                    {checklist.map((item) => (
                      <div key={item.id} className="group flex items-center gap-2">
                        <GripVertical className="h-4 w-4 shrink-0 text-slate-700" />
                        <input
                          type="checkbox"
                          checked={item.done}
                          onChange={() => toggleChecklistItem(item.id)}
                          className="h-3.5 w-3.5 cursor-pointer rounded accent-violet-500"
                        />
                        <span className={cn('flex-1 text-sm', item.done && 'text-slate-600 line-through')}>
                          {item.text}
                        </span>
                        <button
                          onClick={() => removeChecklistItem(item.id)}
                          className="opacity-0 text-slate-600 transition-opacity group-hover:opacity-100 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {/* Add item */}
                    <div className="flex items-center gap-2 pt-1">
                      <span className="h-4 w-4 shrink-0" />
                      <input
                        className="flex-1 bg-transparent text-sm text-slate-400 placeholder-slate-700 outline-none"
                        placeholder="+ Aggiungi voce..."
                        value={newItemText}
                        onChange={(e) => setNewItemText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addChecklistItem())}
                      />
                    </div>
                  </div>
                </div>

                {error && (
                  <p className="rounded-lg border border-red-500/30 bg-red-900/20 px-3 py-2 text-sm text-red-300">
                    {error}
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] px-6 py-4">
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-[var(--overlay)] hover:text-slate-200"
              >
                Annulla
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-violet-500 disabled:opacity-50"
              >
                {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isEdit ? 'Salva modifiche' : 'Crea capitolo'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
