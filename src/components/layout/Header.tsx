import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Save, CheckCircle2 } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { formatRelativeDate } from '@/utils/formatters'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/kanban': 'Kanban Board',
  '/analysis': 'Analisi AI',
  '/settings': 'Impostazioni',
  '/chapters': 'Dettaglio Capitolo',
}

interface HeaderProps {
  actions?: React.ReactNode
}

export default function Header({ actions }: HeaderProps) {
  const location = useLocation()
  const { lastSavedAt } = useUIStore()
  const basePath = '/' + location.pathname.split('/')[1]
  const title = PAGE_TITLES[basePath] ?? 'Book Dashboard'

  return (
    <header className="flex h-14 items-center justify-between border-b border-white/8 bg-[#0A0A0F]/80 px-6 backdrop-blur-sm">
      <motion.h2
        key={title}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        className="text-sm font-semibold text-white"
      >
        {title}
      </motion.h2>

      <div className="flex items-center gap-3">
        {/* Auto-save indicator */}
        <AnimatePresence>
          {lastSavedAt && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 text-xs text-slate-500"
            >
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              Salvato {formatRelativeDate(lastSavedAt)}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Custom actions from page */}
        {actions}
      </div>
    </header>
  )
}

// Convenience export for pages that want to inject header actions
export { Save }
