import {useEffect} from 'react'
import {motion} from 'framer-motion'
import {BookOpen, CheckCircle2, Clock, FileText, TrendingUp, Zap} from 'lucide-react'
import {useChaptersStore} from '@/stores/chaptersStore'
import {useSettingsStore} from '@/stores/settingsStore'
import {useAuthStore} from '@/stores/authStore'
import {ChapterStatus} from '@/types'
import {calcProgress, charsToPages, formatNumber, wordsToReadingTime} from '@/utils/formatters'
import {cn} from '@/utils/cn'

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'violet',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string
  color?: 'violet' | 'cyan' | 'emerald' | 'amber'
}) {
  const colors = {
    violet: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  }
  return (
    <div className="rounded-xl border border-white/8 bg-[#12121A] p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-white">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
        </div>
        <span className={cn('rounded-lg border p-2', colors[color])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const { chapters, loadChapters, totalWords, totalChars, completedCount } = useChaptersStore()
  const { settings, loadSettings } = useSettingsStore()

  useEffect(() => {
    void loadChapters()
    void loadSettings()
  }, [loadChapters, loadSettings])

  const words = totalWords()
  const chars = totalChars()
  const pages = charsToPages(chars, settings.charsPerPage)
  const progress = calcProgress(words, settings.targetWords)
  const readingTime = wordsToReadingTime(words, settings.wordsPerMinuteReading)
  const done = completedCount()

  const statusCounts = Object.values(ChapterStatus).reduce(
    (acc, s) => ({ ...acc, [s]: chapters.filter((c) => c.status === s).length }),
    {} as Record<ChapterStatus, number>
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <motion.h1
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold text-white"
        >
          Ciao, {user?.name ?? user?.login} 👋
        </motion.h1>
        <p className="mt-1 text-sm text-slate-400">
          {settings.title} — panoramica del progetto
        </p>
      </div>

      {/* Progress bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-white/8 bg-[#12121A] p-5"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-slate-300">Completamento libro</span>
          <span className="text-sm font-bold text-violet-400">{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/8">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-violet-600 to-cyan-500"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ delay: 0.3, duration: 1, ease: 'easeOut' }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate-500">
          <span>{formatNumber(words)} parole scritte</span>
          <span>obiettivo: {formatNumber(settings.targetWords)}</span>
        </div>
      </motion.div>

      {/* KPI Grid */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6"
      >
        <StatCard icon={FileText} label="Pagine stimate" value={String(pages)} sub="chars/1800" color="violet" />
        <StatCard icon={BookOpen} label="Parole totali" value={formatNumber(words)} color="cyan" />
        <StatCard icon={CheckCircle2} label="Cap. completati" value={`${done}/${chapters.length}`} color="emerald" />
        <StatCard icon={Clock} label="Tempo lettura" value={readingTime} color="amber" />
        <StatCard icon={TrendingUp} label="Capitoli" value={String(chapters.length)} sub="totali" color="violet" />
        <StatCard icon={Zap} label="Progresso" value={`${progress}%`} color="cyan" />
      </motion.div>

      {/* Status breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl border border-white/8 bg-[#12121A] p-5"
      >
        <h2 className="mb-4 text-sm font-semibold text-slate-300">Stato capitoli</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {[
            { key: ChapterStatus.TODO, label: 'Da fare', color: 'bg-slate-500' },
            { key: ChapterStatus.IN_PROGRESS, label: 'Scrittura', color: 'bg-blue-500' },
            { key: ChapterStatus.REVIEW, label: 'Revisione', color: 'bg-amber-500' },
            { key: ChapterStatus.EXTERNAL_REVIEW, label: 'Rev. esterna', color: 'bg-violet-500' },
            { key: ChapterStatus.REFINEMENT, label: 'Rifinimento', color: 'bg-cyan-500' },
            { key: ChapterStatus.DONE, label: 'Fatto', color: 'bg-emerald-500' },
          ].map(({ key, label, color }) => (
            <div key={key} className="rounded-lg bg-white/4 p-3 text-center">
              <div className={cn('mx-auto mb-1.5 h-2.5 w-2.5 rounded-full', color)} />
              <p className="text-xl font-bold text-white">{statusCounts[key] ?? 0}</p>
              <p className="mt-0.5 text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Empty state hint */}
      {chapters.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl border border-dashed border-white/10 bg-white/2 p-10 text-center"
        >
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-slate-600" />
          <p className="text-sm font-medium text-slate-400">Nessun capitolo ancora</p>
          <p className="mt-1 text-xs text-slate-600">
            Vai al Kanban per aggiungere il primo capitolo
          </p>
        </motion.div>
      )}
    </div>
  )
}
