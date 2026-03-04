import { AnimatePresence, motion } from 'framer-motion'
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { useToastStore, type ToastType } from '@/stores/toastStore'
import { cn } from '@/utils/cn'

const config: Record<ToastType, { icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  success: { icon: CheckCircle2, cls: 'border-emerald-500/30 bg-emerald-950/80 text-emerald-200' },
  error: { icon: AlertCircle, cls: 'border-red-500/30 bg-red-950/80 text-red-200' },
  warning: { icon: AlertTriangle, cls: 'border-amber-500/30 bg-amber-950/80 text-amber-200' },
  info: { icon: Info, cls: 'border-violet-500/30 bg-violet-950/80 text-violet-200' },
}

export default function Toaster() {
  const { toasts, remove } = useToastStore()

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => {
          const { icon: Icon, cls } = config[t.type]
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92, y: 8 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur-md',
                cls
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{t.message}</span>
              <button
                onClick={() => remove(t.id)}
                className="ml-2 opacity-60 transition-opacity hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
