import {useEffect, useMemo, useState} from 'react'
import {motion} from 'framer-motion'
import {Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,} from 'recharts'
import {BookOpen, Calendar, CheckCircle2, Clock, FileText, Sparkles, TrendingUp} from 'lucide-react'
import {useChaptersStore} from '@/stores/chaptersStore'
import {useAnalysisStore} from '@/stores/analysisStore'
import {useChartColors} from '@/hooks/useChartColors'
import {getStatsHistory} from '@/services/statsService'
import type {ChapterAnalysis, StatsSnapshot} from '@/types'
import {ChapterStatus} from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type TimelineEvent = {
  id: string
  date: string
  type: 'created' | 'done' | 'analysis' | 'review'
  label: string
  detail?: string
  icon: typeof BookOpen
  color: string
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({active, payload, label, colors}: {
  active?: boolean
  payload?: readonly {value: number; name: string; color: string}[]
  label?: string
  colors: ReturnType<typeof useChartColors>
}) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-xl"
      style={{background: colors.tooltip, borderColor: colors.tooltipBorder}}
    >
      <p className="mb-1 font-medium text-slate-400">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{color: p.color}}>
          {p.name}: <span className="font-semibold">{p.value.toLocaleString('it')}</span>
        </p>
      ))}
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({icon: Icon, title, subtitle}: {icon: typeof BookOpen; title: string; subtitle?: string}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-600/10">
        <Icon className="h-4.5 w-4.5 text-violet-400" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
  )
}

const SCORE_LABELS: Record<string, string> = {
  stile: 'Stile',
  chiarezza: 'Chiarezza',
  ritmo: 'Ritmo',
  sviluppoPersonaggi: 'Personaggi',
  trama: 'Trama',
  originalita: 'Originalità',
}

const CHAPTER_COLORS = [
  '#7C3AED', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#06B6D4', '#34D399', '#FBBF24', '#F87171',
]

// ─── Activity Calendar ────────────────────────────────────────────────────────

type DayCell = {date: string; words: number}

function ActivityCalendar({history}: {history: StatsSnapshot[]}) {
  const byDate = useMemo(() => {
    const map: Record<string, number> = {}
    for (let i = 1; i < history.length; i++) {
      const delta = history[i].totalWords - history[i - 1].totalWords
      if (delta > 0) map[history[i].date] = delta
    }
    return map
  }, [history])

  const weeks = useMemo((): DayCell[][] => {
    const today = new Date()
    const start = new Date(today)
    start.setDate(today.getDate() - 363) // ~52 weeks
    const days: DayCell[] = []
    const cur = new Date(start)
    while (cur <= today) {
      const iso = cur.toISOString().slice(0, 10)
      days.push({date: iso, words: byDate[iso] ?? 0})
      cur.setDate(cur.getDate() + 1)
    }
    // Pad start so week starts on Monday
    const firstDay = new Date(days[0].date).getDay()
    const pad = firstDay === 0 ? 6 : firstDay - 1
    const padCells: DayCell[] = Array.from({length: pad}, () => ({date: '', words: -1}))
    const grid: DayCell[] = [...padCells, ...days]
    const result: DayCell[][] = []
    for (let i = 0; i < grid.length; i += 7) {
      result.push(grid.slice(i, i + 7))
    }
    return result
  }, [byDate])

  const maxWords = useMemo(() => Math.max(...Object.values(byDate), 1), [byDate])

  function cellColor(words: number) {
    if (words < 0) return 'transparent'
    if (words === 0) return 'rgba(255,255,255,0.04)'
    const ratio = words / maxWords
    if (ratio < 0.25) return 'rgba(124,58,237,0.2)'
    if (ratio < 0.5) return 'rgba(124,58,237,0.45)'
    if (ratio < 0.75) return 'rgba(124,58,237,0.7)'
    return 'rgba(124,58,237,0.95)'
  }

  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1 min-w-max">
        <div className="flex flex-col gap-1 pt-5 pr-1">
          {['L', '', 'M', '', 'G', '', 'S'].map((d, i) => (
            <div key={i} className="h-3 w-3 text-[9px] text-slate-600 leading-3">{d}</div>
          ))}
        </div>
        <div>
          {/* Month labels */}
          <div className="flex gap-1 mb-1">
            {weeks.map((week, wi) => {
              const firstReal = week.find((d) => d.date && d.words >= 0)
              const date = firstReal ? new Date(firstReal.date) : null
              const showMonth = date && (wi === 0 || date.getDate() <= 7)
              return (
                <div key={wi} className="w-3 text-[9px] text-slate-600">
                  {showMonth ? months[date.getMonth()] : ''}
                </div>
              )
            })}
          </div>
          <div className="flex gap-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((day, di) => (
                  <div
                    key={di}
                    title={day.date && day.words >= 0 ? `${day.date}: ${day.words.toLocaleString('it')} parole` : ''}
                    className="h-3 w-3 rounded-[2px] cursor-default"
                    style={{background: cellColor(day.words)}}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-600">
        <span>Meno</span>
        {[0, 0.25, 0.5, 0.75, 1].map((r, i) => (
          <div key={i} className="h-3 w-3 rounded-[2px]"
            style={{background: r === 0 ? 'rgba(255,255,255,0.04)' : `rgba(124,58,237,${0.2 + r * 0.75})`}} />
        ))}
        <span>Di più</span>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReportsPage() {
  const {chapters, loadChapters} = useChaptersStore()
  const {analyses, loadAllAnalyses} = useAnalysisStore()
  const colors = useChartColors()

  const [history, setHistory] = useState<StatsSnapshot[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  useEffect(() => {
    void loadChapters()
    void loadAllAnalyses()
    getStatsHistory()
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoadingHistory(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Writing Velocity ─────────────────────────────────────────────────────

  const velocityData = useMemo(() => {
    if (history.length < 2) return []
    return history.slice(1).map((snap, i) => {
      const prev = history[i]
      const delta = Math.max(0, snap.totalWords - prev.totalWords)
      return {
        date: snap.date.slice(5), // MM-DD
        parole: delta,
        totale: snap.totalWords,
      }
    }).filter((_, i, arr) => arr.length <= 30 || i % Math.ceil(arr.length / 30) === 0)
  }, [history])

  // ── Timeline Events ──────────────────────────────────────────────────────

  const timelineEvents = useMemo((): TimelineEvent[] => {
    const events: TimelineEvent[] = []

    for (const ch of chapters) {
      events.push({
        id: `created-${ch.id}`,
        date: ch.createdAt,
        type: 'created',
        label: `"${ch.title}" creato`,
        detail: `Cap. ${ch.number}`,
        icon: FileText,
        color: '#7C3AED',
      })
      if (ch.status === ChapterStatus.DONE) {
        events.push({
          id: `done-${ch.id}`,
          date: ch.updatedAt,
          type: 'done',
          label: `"${ch.title}" completato`,
          detail: `${ch.wordCount.toLocaleString('it')} parole`,
          icon: CheckCircle2,
          color: '#10B981',
        })
      }
      if (ch.status === ChapterStatus.REVIEW || ch.status === ChapterStatus.EXTERNAL_REVIEW) {
        events.push({
          id: `review-${ch.id}`,
          date: ch.updatedAt,
          type: 'review',
          label: `"${ch.title}" in revisione`,
          icon: Clock,
          color: '#F59E0B',
        })
      }
    }

    for (const [chId, byProvider] of Object.entries(analyses)) {
      const ch = chapters.find((c) => c.id === chId)
      const analysis = Object.values(byProvider)[0] as ChapterAnalysis | undefined
      if (!ch || !analysis) continue
      events.push({
        id: `analysis-${chId}`,
        date: analysis.analyzedAt,
        type: 'analysis',
        label: `Analisi AI — "${ch.title}"`,
        detail: `Score: ${analysis.scores.overall}/10`,
        icon: Sparkles,
        color: '#0EA5E9',
      })
    }

    return events.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40)
  }, [chapters, analyses])

  // ── Chapter Length Data ──────────────────────────────────────────────────

  const chapterLengthData = useMemo(() =>
    [...chapters]
      .sort((a, b) => a.number - b.number)
      .map((ch) => ({
        name: `${String(ch.number).padStart(2, '0')}`,
        fullName: ch.title,
        parole: ch.wordCount,
        target: Math.round(ch.targetChars / 6),
      })),
    [chapters],
  )

  const analysisChapters = useMemo(() =>
    Object.keys(analyses)
      .map((id) => chapters.find((c) => c.id === id))
      .filter(Boolean),
    [analyses, chapters],
  )

  // ── Radar data (last N chapters with analysis) ───────────────────────────

  const radarData = useMemo(() => {
    const keys = Object.keys(SCORE_LABELS)
    return keys.map((key) => {
      const row: Record<string, string | number> = {subject: SCORE_LABELS[key]}
      for (const [chId, byProvider] of Object.entries(analyses)) {
        const ch = chapters.find((c) => c.id === chId)
        const analysis = Object.values(byProvider)[0] as ChapterAnalysis | undefined
        if (!ch || !analysis) continue
        row[ch.title.slice(0, 12)] = (analysis.scores as unknown as Record<string, number>)[key] ?? 0
      }
      return row
    })
  }, [analyses, chapters])

  // ── Summary Stats ────────────────────────────────────────────────────────

  const summaryStats = useMemo(() => {
    const done = chapters.filter((c) => c.status === ChapterStatus.DONE).length
    const totalWords = chapters.reduce((s, c) => s + c.wordCount, 0)
    const avgScore = analysisChapters.length > 0
      ? Object.values(analyses).reduce((s, byProvider) => {
          const a = Object.values(byProvider)[0] as ChapterAnalysis | undefined
          return s + (a?.scores.overall ?? 0)
        }, 0) / analysisChapters.length
      : 0
    const writingDays = history.filter((_, i) => i > 0 && history[i].totalWords > history[i - 1].totalWords).length
    return {done, totalWords, avgScore, writingDays}
  }, [chapters, analyses, analysisChapters, history])

  const fadeIn = {initial: {opacity: 0, y: 12}, animate: {opacity: 1, y: 0}}

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">
      {/* KPI row */}
      <motion.div {...fadeIn} transition={{duration: 0.3}} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {label: 'Capitoli completati', value: summaryStats.done, icon: CheckCircle2, color: 'text-emerald-400'},
          {label: 'Parole scritte', value: summaryStats.totalWords.toLocaleString('it'), icon: FileText, color: 'text-violet-400'},
          {label: 'Score medio AI', value: summaryStats.avgScore > 0 ? summaryStats.avgScore.toFixed(1) + '/10' : '—', icon: Sparkles, color: 'text-sky-400'},
          {label: 'Giorni di scrittura', value: summaryStats.writingDays, icon: Calendar, color: 'text-amber-400'},
        ].map(({label, value, icon: Icon, color}) => (
          <div key={label} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <Icon className={`h-5 w-5 shrink-0 ${color}`} />
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
              <p className="text-lg font-bold text-[var(--text-primary)]">{value}</p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Writing velocity */}
      <motion.div {...fadeIn} transition={{duration: 0.3, delay: 0.05}}
        className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <SectionHeader icon={TrendingUp} title="Velocità di scrittura" subtitle="Parole aggiunte per giorno" />
        {loadingHistory ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          </div>
        ) : velocityData.length < 2 ? (
          <p className="py-10 text-center text-sm text-slate-500">Dati insufficienti — lo storico si accumula nel tempo.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={velocityData} margin={{top: 4, right: 4, left: -20, bottom: 0}}>
              <defs>
                <linearGradient id="rp-vel" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
              <XAxis dataKey="date" tick={{fontSize: 10, fill: colors.axis}} tickLine={false} axisLine={false} />
              <YAxis tick={{fontSize: 10, fill: colors.axis}} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip colors={colors} />} />
              <Area type="monotone" dataKey="parole" name="Parole" stroke="#7C3AED" strokeWidth={2}
                fill="url(#rp-vel)" dot={false} activeDot={{r: 4, fill: '#7C3AED'}} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </motion.div>

      {/* Activity calendar */}
      <motion.div {...fadeIn} transition={{duration: 0.3, delay: 0.1}}
        className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <SectionHeader icon={Calendar} title="Attività di scrittura" subtitle="Parole aggiunte per giorno negli ultimi 12 mesi" />
        {loadingHistory ? (
          <div className="flex h-20 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          </div>
        ) : (
          <ActivityCalendar history={history} />
        )}
      </motion.div>

      {/* Chapter length comparison */}
      <motion.div {...fadeIn} transition={{duration: 0.3, delay: 0.15}}
        className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <SectionHeader icon={BookOpen} title="Lunghezza capitoli" subtitle="Parole attuali vs target" />
        {chapters.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">Nessun capitolo trovato.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, chapters.length * 36)}>
            <BarChart
              data={chapterLengthData}
              layout="vertical"
              margin={{top: 4, right: 16, left: 8, bottom: 0}}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} horizontal={false} />
              <XAxis type="number" tick={{fontSize: 10, fill: colors.axis}} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={{fontSize: 10, fill: colors.axis}} tickLine={false} axisLine={false} width={28} />
              <Tooltip
                content={({active, payload}) => {
                  if (!active || !payload?.length) return null
                  const d = chapterLengthData.find((x) => x.name === (payload[0]?.payload as {name: string}).name)
                  return (
                    <div className="rounded-lg border px-3 py-2 text-xs shadow-xl"
                      style={{background: colors.tooltip, borderColor: colors.tooltipBorder}}>
                      <p className="mb-1 font-medium text-slate-300">{d?.fullName}</p>
                      <p style={{color: '#7C3AED'}}>Parole: {payload.find(p => p.dataKey === 'parole')?.value?.toLocaleString('it')}</p>
                      <p style={{color: '#475569'}}>Target: {payload.find(p => p.dataKey === 'target')?.value?.toLocaleString('it')}</p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="target" name="Target" fill={colors.track} radius={[0, 3, 3, 0]} />
              <Bar dataKey="parole" name="Parole" radius={[0, 3, 3, 0]}>
                {chapterLengthData.map((_, i) => (
                  <Cell key={i} fill={CHAPTER_COLORS[i % CHAPTER_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </motion.div>

      {/* Two-column: radar + scores bar */}
      {analysisChapters.length > 0 && (
        <motion.div {...fadeIn} transition={{duration: 0.3, delay: 0.2}} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Radar comparison */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <SectionHeader icon={Sparkles} title="Profilo qualità" subtitle="Radar per dimensione di analisi" />
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData}>
                <PolarGrid stroke={colors.grid} />
                <PolarAngleAxis dataKey="subject" tick={{fontSize: 10, fill: colors.axis}} />
                {analysisChapters.map((ch, i) => ch && (
                  <Radar
                    key={ch.id}
                    name={ch.title.slice(0, 12)}
                    dataKey={ch.title.slice(0, 12)}
                    stroke={CHAPTER_COLORS[i % CHAPTER_COLORS.length]}
                    fill={CHAPTER_COLORS[i % CHAPTER_COLORS.length]}
                    fillOpacity={0.12}
                    strokeWidth={1.5}
                  />
                ))}
                <Legend iconSize={8} wrapperStyle={{fontSize: 10, color: colors.axis}} />
                <Tooltip content={<ChartTooltip colors={colors} />} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Score bars per chapter */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <SectionHeader icon={Sparkles} title="Score complessivo" subtitle="Overall score per capitolo analizzato" />
            <div className="space-y-3 mt-2">
              {Object.entries(analyses).map(([chId, byProvider]) => {
                const ch = chapters.find((c) => c.id === chId)
                const analysis = Object.values(byProvider)[0] as ChapterAnalysis | undefined
                if (!ch || !analysis) return null
                const pct = (analysis.scores.overall / 10) * 100
                const color = pct >= 80 ? '#10B981' : pct >= 60 ? '#7C3AED' : '#F59E0B'
                return (
                  <div key={chId}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-slate-400 truncate max-w-[180px]">{ch.title}</span>
                      <span className="font-semibold" style={{color}}>{analysis.scores.overall.toFixed(1)}/10</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--overlay)]">
                      <motion.div
                        className="h-full rounded-full"
                        style={{background: color}}
                        initial={{width: 0}}
                        animate={{width: `${pct}%`}}
                        transition={{duration: 0.8, ease: 'easeOut', delay: 0.3}}
                      />
                    </div>
                    <div className="mt-1 flex gap-3 text-[10px] text-slate-600">
                      {Object.entries(SCORE_LABELS).map(([key, lbl]) => (
                        <span key={key}>{lbl}: {((analysis.scores as unknown as Record<string, number>)[key] ?? 0).toFixed(1)}</span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* Timeline */}
      <motion.div {...fadeIn} transition={{duration: 0.3, delay: 0.25}}
        className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <SectionHeader icon={Clock} title="Timeline eventi" subtitle="Creazioni, completamenti, revisioni e analisi in ordine cronologico" />
        {timelineEvents.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">Nessun evento registrato.</p>
        ) : (
          <div className="relative ml-3">
            {/* vertical line */}
            <div className="absolute left-3 top-0 bottom-0 w-px bg-[var(--border)]" />
            <div className="space-y-1">
              {timelineEvents.map((ev, i) => {
                const Icon = ev.icon
                const dateObj = new Date(ev.date)
                const dateStr = isNaN(dateObj.getTime()) ? ev.date.slice(0, 10) :
                  dateObj.toLocaleDateString('it-IT', {day: '2-digit', month: 'short', year: 'numeric'})
                return (
                  <motion.div
                    key={ev.id}
                    initial={{opacity: 0, x: -8}}
                    animate={{opacity: 1, x: 0}}
                    transition={{duration: 0.2, delay: Math.min(i * 0.03, 0.5)}}
                    className="relative flex gap-4 pl-8 py-2.5"
                  >
                    {/* dot */}
                    <div
                      className="absolute left-0 flex h-7 w-7 items-center justify-center rounded-full border-2 bg-[var(--bg-card)]"
                      style={{borderColor: ev.color + '60', background: ev.color + '18'}}
                    >
                      <Icon className="h-3.5 w-3.5" style={{color: ev.color}} />
                    </div>
                    {/* content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{ev.label}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-slate-600">{dateStr}</span>
                        {ev.detail && (
                          <span className="text-[10px] text-slate-500 border border-[var(--border)] rounded-full px-1.5 py-0.5">
                            {ev.detail}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
