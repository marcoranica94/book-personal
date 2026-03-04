import {Navigate} from 'react-router-dom'
import {motion, AnimatePresence} from 'framer-motion'
import {useAuthStore} from '@/stores/authStore'
import {Database, Loader2} from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export default function ProtectedRoute({children}: ProtectedRouteProps) {
  const {isAuthenticated, isLoading, isInitializing} = useAuthStore()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0F]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <>
      {children}

      {/* DB initialization overlay */}
      <AnimatePresence>
        {isInitializing && (
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A0A0F]/90 backdrop-blur-sm"
          >
            <motion.div
              initial={{scale: 0.9, opacity: 0}}
              animate={{scale: 1, opacity: 1}}
              exit={{scale: 0.9, opacity: 0}}
              className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-[#12121A] px-10 py-8 shadow-2xl"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600/20">
                <Database className="h-7 w-7 text-violet-400" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-white">Configurazione database</p>
                <p className="mt-1 text-sm text-slate-400">
                  Prima configurazione — creazione branch dati su GitHub...
                </p>
              </div>
              <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
