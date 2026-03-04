import {motion} from 'framer-motion'
import {Kanban} from 'lucide-react'

export default function KanbanPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        <Kanban className="mx-auto mb-3 h-12 w-12 text-slate-600" />
        <p className="text-slate-400 font-medium">Kanban Board</p>
        <p className="text-xs text-slate-600 mt-1">In arrivo — Sprint 2</p>
      </motion.div>
    </div>
  )
}
