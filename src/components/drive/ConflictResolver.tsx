import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Cloud, Monitor, X } from 'lucide-react'
import { useState } from 'react'
import type { Chapter, DriveConfig } from '@/types'
import { resolveConflict } from '@/services/driveSyncService'
import { toast } from '@/stores/toastStore'

interface ConflictResolverProps {
  chapter: Chapter
  config: DriveConfig
  uid: string
  open: boolean
  onClose: () => void
  onResolved: () => void
  onTokenRefresh?: (tokens: import('@/types').DriveTokens) => void
}

export default function ConflictResolver({
  chapter,
  config,
  uid,
  open,
  onClose,
  onResolved,
  onTokenRefresh,
}: ConflictResolverProps) {
  const [loading, setLoading] = useState<'drive' | 'dashboard' | null>(null)

  async function resolve(resolution: 'drive' | 'dashboard') {
    setLoading(resolution)
    try {
      await resolveConflict(chapter, resolution, config, uid, onTokenRefresh)
      toast.success(
        resolution === 'drive' ? 'Contenuto Drive applicato' : 'Contenuto Dashboard caricato su Drive',
      )
      onResolved()
      onClose()
    } catch (err) {
      toast.error('Errore risoluzione conflitto: ' + (err as Error).message)
    } finally {
      setLoading(null)
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
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-[#12121A] p-6 shadow-2xl"
          >
            {/* Header */}
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/15">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                </span>
                <div>
                  <h2 className="font-semibold text-white">Conflitto rilevato</h2>
                  <p className="text-xs text-slate-500">{chapter.title}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-slate-500 hover:bg-white/8 hover:text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-5 text-sm text-slate-400">
              Il file su Google Drive è stato modificato mentre avevi modifiche locali non ancora
              sincronizzate. Scegli quale versione vuoi mantenere.
            </p>

            {/* Drive content preview */}
            {chapter.driveContent && (
              <div className="mb-5 rounded-lg border border-white/8 bg-white/3 p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                  <Cloud className="h-3.5 w-3.5" />
                  Contenuto Drive (prime 300 caratteri)
                </p>
                <p className="line-clamp-4 font-mono text-xs text-slate-500">
                  {chapter.driveContent.slice(0, 300)}
                  {chapter.driveContent.length > 300 && '...'}
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => resolve('drive')}
                disabled={!!loading}
                className="flex flex-col items-center gap-2 rounded-xl border border-blue-700/40 bg-blue-950/30 px-4 py-4 text-sm transition-colors hover:bg-blue-900/30 disabled:opacity-50"
              >
                <Cloud className="h-5 w-5 text-blue-400" />
                <span className="font-medium text-blue-300">Usa Drive</span>
                <span className="text-center text-xs text-slate-500">
                  Scarica il file Drive e aggiorna il capitolo
                </span>
              </button>

              <button
                onClick={() => resolve('dashboard')}
                disabled={!!loading}
                className="flex flex-col items-center gap-2 rounded-xl border border-violet-700/40 bg-violet-950/30 px-4 py-4 text-sm transition-colors hover:bg-violet-900/30 disabled:opacity-50"
              >
                <Monitor className="h-5 w-5 text-violet-400" />
                <span className="font-medium text-violet-300">Usa Dashboard</span>
                <span className="text-center text-xs text-slate-500">
                  Carica su Drive il contenuto attuale
                </span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
