import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, CheckCircle2, Circle } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import type { ChecklistItem } from '@/types'
import { cn } from '@/utils/cn'

interface ChecklistEditorProps {
  items: ChecklistItem[]
  onChange: (items: ChecklistItem[]) => void
  readOnly?: boolean
}

export default function ChecklistEditor({ items, onChange, readOnly }: ChecklistEditorProps) {
  const [newText, setNewText] = useState('')

  const done = items.filter((i) => i.done).length
  const total = items.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  function toggle(id: string) {
    onChange(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)))
  }

  function remove(id: string) {
    onChange(items.filter((i) => i.id !== id))
  }

  function addItem() {
    const text = newText.trim()
    if (!text) return
    onChange([...items, { id: uuidv4(), text, done: false }])
    setNewText('')
  }

  return (
    <div className="space-y-3">
      {/* Progress header */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-white/8">
          <motion.div
            className="h-full rounded-full bg-emerald-500"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
        <span className="text-xs font-medium text-slate-400 shrink-0">
          {done}/{total} ({pct}%)
        </span>
      </div>

      {/* Items */}
      <div className="space-y-1">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="group flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/4"
            >
              <button
                onClick={() => !readOnly && toggle(item.id)}
                className={cn(
                  'shrink-0 transition-colors',
                  item.done ? 'text-emerald-400' : 'text-slate-600 hover:text-slate-400'
                )}
              >
                {item.done
                  ? <CheckCircle2 className="h-4 w-4" />
                  : <Circle className="h-4 w-4" />
                }
              </button>
              <span className={cn(
                'flex-1 text-sm transition-colors',
                item.done ? 'text-slate-600 line-through' : 'text-slate-300'
              )}>
                {item.text}
              </span>
              {!readOnly && (
                <button
                  onClick={() => remove(item.id)}
                  className="opacity-0 text-slate-700 transition-opacity group-hover:opacity-100 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Add item */}
      {!readOnly && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-white/10 px-3 py-2">
          <Plus className="h-3.5 w-3.5 shrink-0 text-slate-700" />
          <input
            className="flex-1 bg-transparent text-sm text-slate-400 placeholder-slate-700 outline-none"
            placeholder="Aggiungi voce..."
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
          />
        </div>
      )}
    </div>
  )
}
