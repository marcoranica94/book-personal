import {useEffect, useState} from 'react'
import {motion} from 'framer-motion'
import {BookOpen, Calendar, CheckCircle2, Clock, FileText, TrendingUp, Zap} from 'lucide-react'
import {differenceInDays} from 'date-fns'
import {useChaptersStore} from '@/stores/chaptersStore'
import {useSettingsStore} from '@/stores/settingsStore'
import {useAuthStore} from '@/stores/authStore'
import {useAnalysisStore} from '@/stores/analysisStore'
import type {StatsSnapshot} from '@/types'
import {ChapterStatus} from '@/types'
import {appendStatsSnapshot, getStatsHistory} from '@/services/statsService'
import {calcProgress, calcProjectedEndDate, charsToPages, formatDate, formatNumber, wordsPerDay, wordsToReadingTime,} from '@/utils/formatters'
import {useCountUp} from '@/hooks/useCountUp'
import {cn} from '@/utils/cn'
import ProgressRing from '@/components/dashboard/ProgressRing'
import WordCountChart from '@/components/dashboard/WordCountChart'
import StatusDonutChart from '@/components/dashboard/StatusDonutChart'
import ProductivityChart from '@/components/dashboard/ProductivityChart'

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sub, color = 'violet', delay = 0,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string; value: string; sub?: string
  color?: 'violet' | 'cyan' | 'emerald' | 'amber' | 'slate'
  delay?: number
}) {
  const colors = {
    violet: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    cyan:   'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    emerald:'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    amber:  'text-amber-400 bg-amber-500/10 border-amber-500/20',
    slate:  'text-slate-400 bg-slate-500/10 border-slate-500/20',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 truncate">{label}</p>
          <p className="mt-1 text-xl font-bold text-[var(--text-primary)]">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-600">{sub}</p>}
        </div>
        <span className={cn('flex shrink-0 h-9 w-9 items-center justify-center rounded-lg border ml-3', colors[color])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </motion.div>
  )
}

// ─── Chart Card wrapper ────────────────────────────────────────────────────────

function ChartCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5', className)}>
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      {children}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuthStore()
  const { chapters, loadChapters, totalWords, totalChars, completedCount } = useChaptersStore()
  const { settings, loadSettings } = useSettingsStore()
  const { loadAllAnalyses } = useAnalysisStore()
  const [history, setHistory] = useState<StatsSnapshot[]>([])

  useEffect(() => {
    void loadChapters()
    void loadSettings()
  }, [loadChapters, loadSettings])

  // Load stats history + save today's snapshot
  useEffect(() => {
    async function loadAndSave() {
      try {
        const hist = await getStatsHistory()
        setHistory(hist)

        // Save today's snapshot (once per day)
        const today = new Date().toISOString().split('T')[0]
        const alreadySaved = hist.some((s) => s.date.startsWith(today))
        if (!alreadySaved && chapters.length > 0) {
          const snap: StatsSnapshot = {
            date: new Date().toISOString(),
            totalWords: totalWords(),
            totalChars: totalChars(),
            totalPages: charsToPages(totalChars(), settings.charsPerPage),
            chaptersByStatus: Object.values(ChapterStatus).reduce(
              (acc, s) => ({ ...acc, [s]: chapters.filter((c) => c.status === s).length }),
              {} as Record<ChapterStatus, number>
            ),
          }
          await appendStatsSnapshot(snap)
          setHistory((prev) => {
            const idx = prev.findIndex((s) => s.date.startsWith(today))
            if (idx >= 0) { const next = [...prev]; next[idx] = snap; return next }
            return [...prev, snap]
          })
        }
      } catch { /* silently ignore — data branch may not exist yet */ }
    }
    if (chapters.length > 0) void loadAndSave()
  }, [chapters, settings.charsPerPage, totalChars, totalWords])

  useEffect(() => {
    if (chapters.length > 0) {
      void loadAllAnalyses()
    }
  }, [chapters, loadAllAnalyses])

  // Stats
  const words = totalWords()
  const chars = totalChars()
  const pages = charsToPages(chars, settings.charsPerPage)
  const progress = calcProgress(words, settings.targetWords)
  const readingTime = wordsToReadingTime(words, settings.wordsPerMinuteReading)
  const done = completedCount()
  const daysActive = differenceInDays(new Date(), new Date(settings.startDate)) + 1
  const avgWordsPerDay = wordsPerDay(words, settings.startDate)
  const projectedEnd = calcProjectedEndDate(words, settings.targetWords, settings.startDate)

  const statusCounts = Object.values(ChapterStatus).reduce(
    (acc, s) => ({ ...acc, [s]: chapters.filter((c) => c.status === s).length }),
    {} as Record<ChapterStatus, number>
  )

  // Count-up animated values
  const animWords = useCountUp(words, 1200)
  const animPages = useCountUp(pages, 1000)
  const animProgress = useCountUp(progress, 1100)

  // Upcoming due dates
  const dueSoon = chapters
    .filter((c) => c.dueDate && differenceInDays(new Date(c.dueDate), new Date()) <= 7 && differenceInDays(new Date(c.dueDate), new Date()) >= 0)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 3)

  const greeting = user?.displayName?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'scrittore'

  return (
    <div className="space-y-6 p-6">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Ciao, {greeting} 👋</h1>
        <p className="mt-1 text-sm text-slate-500">{settings.title} — panoramica aggiornata</p>
      </motion.div>

      {/* Progress bar principale */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-300">Completamento libro</span>
          <span className="text-sm font-bold text-violet-400">{animProgress}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-[var(--overlay)]">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-violet-600 via-violet-500 to-cyan-500"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ delay: 0.4, duration: 1.2, ease: 'easeOut' }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate-600">
          <span>{formatNumber(words)} parole scritte</span>
          <span>obiettivo: {formatNumber(settings.targetWords)}</span>
        </div>
      </motion.div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <div className="col-span-2 sm:col-span-2 lg:col-span-2">
          <KpiCard icon={FileText} label="Parole totali" value={formatNumber(animWords)} color="violet" delay={0.1} />
        </div>
        <div className="col-span-2 sm:col-span-2 lg:col-span-2">
          <KpiCard icon={BookOpen} label="Cartelle" value={String(animPages)} sub={`car. incl. spazi ÷ ${settings.charsPerPage}`} color="cyan" delay={0.15} />
        </div>
        <div className="col-span-2 sm:col-span-2 lg:col-span-2">
          <KpiCard icon={CheckCircle2} label="Cap. completati" value={`${done}/${chapters.length}`} color="emerald" delay={0.2} />
        </div>
        <div className="col-span-2 sm:col-span-2 lg:col-span-2">
          <KpiCard icon={Clock} label="Tempo lettura" value={readingTime} color="amber" delay={0.25} />
        </div>
        <div className="col-span-2 sm:col-span-2 lg:col-span-2">
          <KpiCard icon={TrendingUp} label="Parole/giorno" value={formatNumber(avgWordsPerDay)} sub="media" color="violet" delay={0.3} />
        </div>
        <div className="col-span-2 sm:col-span-2 lg:col-span-2">
          <KpiCard icon={Calendar} label="Giorni attivi" value={String(daysActive)} color="cyan" delay={0.35} />
        </div>
        <div className="col-span-2 sm:col-span-2 lg:col-span-2">
          <KpiCard icon={Zap} label="Fine stimata" value={projectedEnd ?? '—'} color="amber" delay={0.4} />
        </div>
        <div className="col-span-2 sm:col-span-2 lg:col-span-2">
          <KpiCard icon={FileText} label="Mancano" value={formatNumber(Math.max(0, settings.targetWords - words))} sub="parole al target" color="slate" delay={0.45} />
        </div>
      </div>

      {/* Charts row */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-3"
      >
        {/* Andamento parole */}
        <ChartCard title="Andamento parole nel tempo" className="lg:col-span-2">
          <div className="h-44">
            <WordCountChart history={history} />
          </div>
        </ChartCard>

        {/* Stato capitoli + progress ring */}
        <ChartCard title="Stato capitoli">
          <div className="flex items-center justify-center gap-6">
            <ProgressRing value={progress} size={100} stroke={9} label={`${animProgress}%`} sublabel="fatto" />
            <div className="space-y-1.5">
              {Object.entries(statusCounts)
                .filter(([, v]) => v > 0)
                .map(([s, v]) => (
                  <div key={s} className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-[var(--text-primary)] w-4 text-right">{v}</span>
                    <span className="text-slate-500">{s.replace('_', ' ')}</span>
                  </div>
                ))}
            </div>
          </div>
        </ChartCard>
      </motion.div>

      {/* Second charts row */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
      >
        {/* Produttività */}
        <ChartCard title="Produttività giornaliera (parole)">
          <div className="h-40">
            <ProductivityChart history={history} />
          </div>
        </ChartCard>

        {/* Distribuzione status */}
        <ChartCard title="Distribuzione capitoli">
          <div className="h-40">
            <StatusDonutChart counts={statusCounts} />
          </div>
        </ChartCard>
      </motion.div>

      {/* Tabella cartelle per capitolo */}
      {chapters.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]"
        >
          <div className="border-b border-[var(--border)] px-5 py-4 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Cartelle per capitolo
            </h3>
            <span className="text-xs text-slate-600">car. incl. spazi ÷ {settings.charsPerPage}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs text-slate-600">
                  <th className="px-5 py-2.5 text-left font-medium w-10">#</th>
                  <th className="px-3 py-2.5 text-left font-medium">Titolo</th>
                  <th className="px-3 py-2.5 text-right font-medium">Caratteri</th>
                  <th className="px-3 py-2.5 text-right font-medium">Cartelle</th>
                  <th className="px-5 py-2.5 text-left font-medium w-40">Avanzamento</th>
                </tr>
              </thead>
              <tbody>
                {[...chapters]
                  .filter((c) => c.title.toLowerCase().startsWith('capitolo'))
                  .sort((a, b) => a.title.localeCompare(b.title, 'it'))
                  .map((c) => {
                    const cartelle = charsToPages(c.currentChars, settings.charsPerPage)
                    const targetCartelle = charsToPages(c.targetChars, settings.charsPerPage)
                    const pct = Math.min(100, c.targetChars > 0 ? Math.round((c.currentChars / c.targetChars) * 100) : 0)
                    return (
                      <tr key={c.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-5 py-3 text-xs text-slate-600 tabular-nums">
                          {String(c.number).padStart(2, '0')}
                        </td>
                        <td className="px-3 py-3 text-slate-300 max-w-[180px] truncate">{c.title}</td>
                        <td className="px-3 py-3 text-right text-xs tabular-nums text-slate-500">
                          {c.currentChars.toLocaleString('it-IT')}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          <span className="font-semibold text-cyan-400">{cartelle}</span>
                          <span className="text-xs text-slate-600">/{targetCartelle}</span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-[var(--overlay)] overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all',
                                  pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-cyan-500' : pct >= 30 ? 'bg-violet-500' : 'bg-slate-600'
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-600 w-8 text-right tabular-nums">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--border)] bg-[var(--overlay)]">
                  <td colSpan={2} className="px-5 py-3 text-xs font-semibold text-slate-400">Totale</td>
                  <td className="px-3 py-3 text-right text-xs tabular-nums font-semibold text-slate-400">
                    {chars.toLocaleString('it-IT')}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <span className="font-bold text-cyan-400">{pages}</span>
                  </td>
                  <td className="px-5 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        </motion.div>
      )}

      {/* Due soon + empty state */}
      {dueSoon.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-5"
        >
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-400">
            In scadenza nei prossimi 7 giorni
          </h3>
          <div className="space-y-2">
            {dueSoon.map((c) => (
              <div key={c.id} className="flex items-center gap-3 text-sm">
                <span className="text-slate-500">Cap. {c.number}</span>
                <span className="flex-1 font-medium text-slate-200">{c.title}</span>
                <span className="text-amber-400">{formatDate(c.dueDate)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {chapters.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--overlay)] py-14 text-center"
        >
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-slate-700" />
          <p className="text-sm font-medium text-slate-400">Nessun capitolo ancora</p>
          <p className="mt-1 text-xs text-slate-600">Vai al Kanban per aggiungere il primo capitolo</p>
        </motion.div>
      )}
    </div>
  )
}
