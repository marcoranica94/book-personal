import {useCallback, useEffect, useRef} from 'react'
import {Outlet, useLocation} from 'react-router-dom'
import {AnimatePresence, motion} from 'framer-motion'
import Sidebar from './Sidebar'
import Header from './Header'
import Toaster from '@/components/ui/Toaster'
import {toast} from '@/stores/toastStore'

const LS_PENDING_KEY = 'book_pending_analysis'

interface PendingAnalysis {
  chapterId: string
  chapterTitle: string
  triggeredAt: string
}

export default function Layout() {
  const location = useLocation()
  const mainRef = useRef<HTMLDivElement>(null)
  const prevPathRef = useRef(location.pathname)

  // Show toast when navigating away from /analysis while an analysis is pending
  useEffect(() => {
    const prevPath = prevPathRef.current
    prevPathRef.current = location.pathname
    if (prevPath.includes('/analysis') && !location.pathname.includes('/analysis')) {
      try {
        const raw = localStorage.getItem(LS_PENDING_KEY)
        if (raw) {
          const pending = JSON.parse(raw) as PendingAnalysis
          const elapsedSecs = Math.floor((Date.now() - new Date(pending.triggeredAt).getTime()) / 1000)
          const elapsed = elapsedSecs < 60 ? `${elapsedSecs}s` : `${Math.floor(elapsedSecs / 60)}m ${elapsedSecs % 60 > 0 ? ` ${elapsedSecs % 60}s` : ''}`
          toast.info(`⚙️ Analisi in corso: "${pending.chapterTitle}" (${elapsed}) — torna ad Analisi AI per monitorarla`)
        }
      } catch { /* ignore */ }
    }
  }, [location.pathname])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = mainRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    el.style.setProperty('--cx', `${x}%`)
    el.style.setProperty('--cy', `${y}%`)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Ambient gradient orbs — pointer-events:none, non toccano l'UI */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute h-[600px] w-[600px] rounded-full bg-violet-900/10 blur-[140px]"
          style={{
            top: '5%',
            left: '20%',
            animation: 'orb-drift-1 18s ease-in-out infinite',
          }}
        />
        <div
          className="absolute h-[400px] w-[400px] rounded-full bg-cyan-900/8 blur-[120px]"
          style={{
            bottom: '10%',
            right: '15%',
            animation: 'orb-drift-2 22s ease-in-out infinite',
          }}
        />
        <div
          className="absolute h-[300px] w-[300px] rounded-full bg-violet-800/6 blur-[100px]"
          style={{
            top: '50%',
            right: '30%',
            animation: 'orb-drift-3 28s ease-in-out infinite',
          }}
        />
      </div>

      <Sidebar />

      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <Header />
        <main
          ref={mainRef}
          onMouseMove={handleMouseMove}
          className="cursor-glow-layer relative flex-1 overflow-y-auto"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{opacity: 0, y: 6}}
              animate={{opacity: 1, y: 0}}
              exit={{opacity: 0, y: -4}}
              transition={{duration: 0.2, ease: 'easeOut'}}
              className="h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <Toaster />
    </div>
  )
}
