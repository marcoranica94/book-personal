import {useEffect, useMemo, useState} from 'react'
import {motion} from 'framer-motion'
import {AlertTriangle, CheckCircle2, Clock, RefreshCw, Sparkles} from 'lucide-react'
import {useAnalysisStore} from '@/stores/analysisStore'
import {useChaptersStore} from '@/stores/chaptersStore'
import type {AIProvider} from '@/types'
import {AI_PROVIDER_CONFIG, getScoreColor} from '@/types'
import {cn} from '@/utils/cn'

type TimelineItem = {
  key: string
  date: string
  chapterId: string
  chapterTitle: string
  chapterNumber: number
  provider: AIProvider
  status: 'ok' | 'error'
  score?: number
  model: string
  error?: string
}

export default function AnalysisHistoryPage() {
  const {analyses, analysisErrors, history, loadAllAnalyses, loadAnalysisErrors, loadChapterHistory} =
    useAnalysisStore()
  const {chapters, loadChapters} = useChaptersStore()

  const [filterStatus, setFilterStatus] = useState<'all' | 'ok' | 'error'>('all')
  const [filterProvider, setFilterProvider] = useState<AIProvider | 'all'>('all')
  const [isLoadingFull, setIsLoadingFull] = useState(false)
  const [fullLoaded, setFullLoaded] = useState(false)

  useEffect(() => {
    void loadChapters()
    void loadAllAnalyses()
    void loadAnalysisErrors()
  }, [loadChapters, loadAllAnalyses, loadAnalysisErrors])

  const chapterMap = useMemo(
    () => Object.fromEntries(chapters.map((c) => [c.id, c])),
    [chapters],
  )

  const timeline = useMemo((): TimelineItem[] => {
    const items: TimelineItem[] = []

    if (fullLoaded) {
      // All history entries (every past run per chapter/provider)
      for (const [chapterId, byProvider] of Object.entries(history)) {
        for (const [prov, entries] of Object.entries(byProvider)) {
          const ch = chapterMap[chapterId]
          for (const entry of entries) {
            items.push({
              key: `hist-${chapterId}-${prov}-${entry._docId}`,
              date: entry.analyzedAt,
              chapterId,
              chapterTitle: ch?.title ?? chapterId,
              chapterNumber: ch?.number ?? 0,
              provider: prov as AIProvider,
              status: 'ok',
              score: entry.scores?.overall,
              model: entry.model ?? '',
            })
          }
        }
      }
    } else {
      // Only latest analysis per chapter/provider
      for (const [chapterId, byProvider] of Object.entries(analyses)) {
        for (const [prov, analysis] of Object.entries(byProvider)) {
          const ch = chapterMap[chapterId]
          items.push({
            key: `${chapterId}-${prov}`,
            date: analysis.analyzedAt,
            chapterId,
            chapterTitle: ch?.title ?? chapterId,
            chapterNumber: ch?.number ?? 0,
            provider: prov as AIProvider,
            status: 'ok',
            score: analysis.scores?.overall,
            model: analysis.model ?? '',
          })
        }
      }
    }

    // Errors always included
    for (const err of analysisErrors) {
      const ch = chapterMap[err.chapterId]
      items.push({
        key: `err-${err.chapterId}-${err.provider}-${err.failedAt}`,
        date: err.failedAt,
        chapterId: err.chapterId,
        chapterTitle: ch?.title ?? err.chapterId,
        chapterNumber: ch?.number ?? 0,
        provider: err.provider as AIProvider,
        status: 'error',
        model: err.model,
        error: err.error,
      })
    }

    return items
      .filter((i) => filterStatus === 'all' || i.status === filterStatus)
      .filter((i) => filterProvider === 'all' || i.provider === filterProvider)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [analyses, analysisErrors, history, chapterMap, filterStatus, filterProvider, fullLoaded])

  const loadFullHistory = async () => {
    setIsLoadingFull(true)
    for (const chapterId of Object.keys(analyses)) {
      await loadChapterHistory(chapterId)
    }
    setFullLoaded(true)
    setIsLoadingFull(false)
  }

  const totalOk = useMemo(() => Object.values(analyses).flatMap(Object.values).length, [analyses])
  const totalErr = analysisErrors.length

  const usedProviders = useMemo(
    () =>
      Array.from(
        new Set([
          ...Object.values(analyses).flatMap((bp) => Object.keys(bp)),
          ...analysisErrors.map((e) => e.provider),
        ]),
      ) as AIProvider[],
    [analyses, analysisErrors],
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Storico Analisi</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {totalOk} riuscite · {totalErr} fallite
            {!fullLoaded && (
              <span className="ml-2 text-xs text-slate-600">— ultima analisi per capitolo</span>
            )}
          </p>
        </div>
        {!fullLoaded && (
          <button
            onClick={() => void loadFullHistory()}
            disabled={isLoadingFull || Object.keys(analyses).length === 0}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200 disabled:opacity-40"
          >
            {isLoadingFull ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Clock className="h-3.5 w-3.5" />
            )}
            {isLoadingFull ? 'Caricamento…' : 'Carica storico completo'}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'ok', 'error'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-all',
              filterStatus === s
                ? s === 'ok'
                  ? 'border-emerald-500/50 bg-emerald-900/20 text-emerald-400'
                  : s === 'error'
                    ? 'border-red-500/50 bg-red-900/20 text-red-400'
                    : 'border-violet-500/50 bg-violet-900/20 text-violet-400'
                : 'border-[var(--border)] text-slate-500 hover:border-slate-500',
            )}
          >
            {s === 'all' ? 'Tutte' : s === 'ok' ? '✓ Riuscite' : '✗ Fallite'}
          </button>
        ))}

        {usedProviders.length > 1 && (
          <>
            <div className="h-4 w-px bg-[var(--border)]" />
            <button
              onClick={() => setFilterProvider('all')}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-all',
                filterProvider === 'all'
                  ? 'border-slate-500/50 bg-slate-800/40 text-slate-300'
                  : 'border-[var(--border)] text-slate-500 hover:border-slate-500',
              )}
            >
              Tutti i modelli
            </button>
            {usedProviders.map((p) => (
              <button
                key={p}
                onClick={() => setFilterProvider(p)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-all',
                  filterProvider === p
                    ? 'border-slate-500/50 bg-slate-800/40 text-slate-300'
                    : 'border-[var(--border)] text-slate-500 hover:border-slate-500',
                )}
              >
                {AI_PROVIDER_CONFIG[p]?.label ?? p}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Table */}
      {timeline.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-12 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-3 text-sm text-slate-500">Nessuna analisi trovata</p>
        </div>
      ) : (
        <motion.div
          initial={{opacity: 0, y: 8}}
          animate={{opacity: 1, y: 0}}
          className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--overlay)]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Data
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Capitolo
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Modello IA
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Esito
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Score
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {timeline.map((item) => (
                <tr key={item.key} className="transition-colors hover:bg-[var(--overlay)]">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    {new Date(item.date).toLocaleString('it-IT', {
                      day: '2-digit',
                      month: '2-digit',
                      year: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span className="mr-1.5 text-xs text-slate-600">
                      #{String(item.chapterNumber).padStart(2, '0')}
                    </span>
                    <span className="text-sm text-[var(--text-primary)]">{item.chapterTitle}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-xs font-medium',
                        AI_PROVIDER_CONFIG[item.provider]?.color ?? 'text-slate-400',
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          AI_PROVIDER_CONFIG[item.provider]?.dot ?? 'bg-slate-600',
                        )}
                      />
                      {AI_PROVIDER_CONFIG[item.provider]?.label ?? item.provider}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {item.status === 'ok' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        OK
                      </span>
                    ) : (
                      <div>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Fallita
                        </span>
                        {item.error && (
                          <p className="mt-0.5 max-w-xs truncate text-xs text-slate-600" title={item.error}>
                            {item.error}
                          </p>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.score != null ? (
                      <span className={cn('text-sm font-bold', getScoreColor(item.score))}>
                        {item.score.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-700">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}
    </div>
  )
}
