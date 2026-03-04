import {useEffect, useRef, useState} from 'react'
import {AnimatePresence, motion} from 'framer-motion'
import {CheckCheck, FileEdit, Loader2, Play, RadarIcon, RefreshCw, Sparkles, Square, X} from 'lucide-react'
import {PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer} from 'recharts'
import {useChaptersStore} from '@/stores/chaptersStore'
import {useAnalysisStore} from '@/stores/analysisStore'
import {useDriveStore} from '@/stores/driveStore'
import {useAuthStore} from '@/stores/authStore'
import {toast} from '@/stores/toastStore'
import type {AnalysisCorrection} from '@/types'
import {getScoreColor, SyncSource, SyncStatus} from '@/types'
import {triggerWorkflow} from '@/services/githubWorkflow'
import {patchAnalysis} from '@/services/analysisService'
import * as chaptersService from '@/services/chaptersService'
import {getValidAccessToken} from '@/services/driveAuthService'
import {getDriveFileContent} from '@/services/driveFileService'
import {GITHUB_REPO_NAME, GITHUB_REPO_OWNER} from '@/utils/constants'
import {formatRelativeDate} from '@/utils/formatters'
import {cn} from '@/utils/cn'
import ProgressRing from '@/components/dashboard/ProgressRing'

// ─── Constants ────────────────────────────────────────────────────────────────

const SCORE_LABELS: Record<string, string> = {
  stile: 'Stile',
  chiarezza: 'Chiarezza',
  ritmo: 'Ritmo',
  sviluppoPersonaggi: 'Personaggi',
  trama: 'Trama',
  originalita: 'Originalità',
}

const CORRECTION_TYPE_LABELS: Record<string, string> = {
  grammar: 'Grammatica',
  style: 'Stile',
  clarity: 'Chiarezza',
  continuity: 'Continuità',
}

const CORRECTION_TYPE_COLORS: Record<string, string> = {
  grammar: 'border-red-800/30 bg-red-900/30 text-red-400',
  style: 'border-violet-800/30 bg-violet-900/30 text-violet-400',
  clarity: 'border-blue-800/30 bg-blue-900/30 text-blue-400',
  continuity: 'border-amber-800/30 bg-amber-900/30 text-amber-400',
}

type Tab = 'strengths' | 'weaknesses' | 'suggestions' | 'corrections' | 'editor'

// ─── Correzione applicazione ──────────────────────────────────────────────────

function applyCorrectionsToContent(
  content: string,
  corrections: AnalysisCorrection[],
  selected: Set<number>,
): { content: string; applied: number; notFound: string[] } {
  let result = content
  let applied = 0
  const notFound: string[] = []
  for (const idx of Array.from(selected).sort((a, b) => a - b)) {
    const c = corrections[idx]
    if (!c) continue
    if (result.includes(c.original)) {
      result = result.replace(c.original, c.suggested)
      applied++
    } else {
      notFound.push(c.original.slice(0, 40))
    }
  }
  return { content: result, applied, notFound }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({label, value}: {label: string; value: number}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-slate-400">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
        <motion.div
          className={cn(
            'h-full rounded-full',
            value >= 8 ? 'bg-emerald-500' : value >= 6 ? 'bg-blue-500' : value >= 4 ? 'bg-amber-500' : 'bg-red-500'
          )}
          initial={{width: 0}}
          animate={{width: `${value * 10}%`}}
          transition={{duration: 0.6, ease: 'easeOut'}}
        />
      </div>
      <span className={cn('w-8 shrink-0 text-right text-xs font-semibold tabular-nums', getScoreColor(value))}>
        {value.toFixed(1)}
      </span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const {chapters, loadChapters} = useChaptersStore()
  const {analyses, loadAnalysis, loadAllAnalyses, isLoading} = useAnalysisStore()
  const {config: driveConfig, patchTokens} = useDriveStore()
  const {user} = useAuthStore()
  const [selectedId, setSelectedId] = useState<string>('')
  const [activeTab, setActiveTab] = useState<Tab>('strengths')
  const [triggering, setTriggering] = useState(false)
  // Correzioni
  const [selectedCorrections, setSelectedCorrections] = useState<Set<number>>(new Set())
  const [isApplying, setIsApplying] = useState(false)
  // Editor inline
  const [editorContent, setEditorContent] = useState('')
  const [isSavingContent, setIsSavingContent] = useState(false)
  const [isForceSyncingDrive, setIsForceSyncingDrive] = useState(false)
  const editorRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void loadChapters()
  }, [loadChapters])

  useEffect(() => {
    if (chapters.length > 0) void loadAllAnalyses()
  }, [chapters, loadAllAnalyses])

  useEffect(() => {
    if (selectedId) void loadAnalysis(selectedId)
    setSelectedCorrections(new Set())
  }, [selectedId, loadAnalysis])

  useEffect(() => {
    const chapter = chapters.find((c) => c.id === selectedId)
    setEditorContent(chapter?.driveContent ?? '')
  }, [selectedId, chapters])

  const selectedChapter = chapters.find((c) => c.id === selectedId) ?? null
  const analysis = selectedId ? (analyses[selectedId] ?? null) : null

  async function triggerAnalysis(chapterId: string) {
    setTriggering(true)
    try {
      await triggerWorkflow(GITHUB_REPO_OWNER, GITHUB_REPO_NAME, 'ai-analysis.yml', {
        chapter_id: chapterId,
      })
      toast.success('Analisi avviata! Attendi qualche minuto, poi clicca Ricarica.')
    } catch (err) {
      toast.error('Errore: ' + (err as Error).message)
    } finally {
      setTriggering(false)
    }
  }

  async function handleApplyCorrections() {
    if (!selectedChapter || !analysis || selectedCorrections.size === 0) return
    setIsApplying(true)
    try {
      const baseContent = selectedChapter.driveContent ?? ''
      const { content, applied, notFound } = applyCorrectionsToContent(
        baseContent,
        analysis.corrections,
        selectedCorrections,
      )
      const accepted = Array.from(selectedCorrections)
      const rejected = analysis.corrections
        .map((_, i) => i)
        .filter((i) => !selectedCorrections.has(i))

      await chaptersService.updateChapter(selectedChapter.id, {
        driveContent: content,
        syncStatus: SyncStatus.PENDING_PUSH,
        syncSource: SyncSource.AI,
      })
      await patchAnalysis(selectedChapter.id, {
        acceptedCorrections: accepted,
        rejectedCorrections: rejected,
        appliedAt: new Date().toISOString(),
      })
      await loadChapters()
      await loadAnalysis(selectedId)
      setSelectedCorrections(new Set())

      if (notFound.length) {
        toast.success(`${applied} correzioni applicate — ${notFound.length} non trovate nel testo`)
      } else {
        toast.success(`${applied} correzioni applicate al testo`)
      }
    } catch (err) {
      toast.error('Errore applicazione: ' + (err as Error).message)
    } finally {
      setIsApplying(false)
    }
  }

  async function handleSaveEditorContent() {
    if (!selectedChapter) return
    setIsSavingContent(true)
    try {
      await chaptersService.updateChapter(selectedChapter.id, {
        driveContent: editorContent,
        currentChars: editorContent.length,
        wordCount: editorContent.split(/\s+/).filter(Boolean).length,
        syncStatus: SyncStatus.PENDING_PUSH,
        syncSource: SyncSource.MANUAL,
      })
      await loadChapters()
      toast.success('Testo salvato — usa "Sincronizza ora" per inviarlo su Drive')
    } catch (err) {
      toast.error('Errore salvataggio: ' + (err as Error).message)
    } finally {
      setIsSavingContent(false)
    }
  }

  async function handleReloadFromDrive() {
    if (!selectedChapter?.driveFileId || !driveConfig || !user) return
    setIsForceSyncingDrive(true)
    try {
      const {accessToken, updatedTokens} = await getValidAccessToken(driveConfig, user.uid)
      if (updatedTokens) await patchTokens(user.uid, updatedTokens)
      const content = await getDriveFileContent(accessToken, selectedChapter.driveFileId, selectedChapter.driveMimeType ?? 'text/plain')
      await chaptersService.updateChapter(selectedChapter.id, {
        driveContent: content,
        currentChars: content.length,
        wordCount: content.split(/\s+/).filter(Boolean).length,
        syncStatus: SyncStatus.SYNCED,
        syncSource: SyncSource.DRIVE,
        lastSyncAt: new Date().toISOString(),
      })
      await loadChapters()
      setEditorContent(content)
      toast.success('Contenuto ricaricato da Drive')
    } catch (err) {
      toast.error('Errore: ' + (err as Error).message)
    } finally {
      setIsForceSyncingDrive(false)
    }
  }

  function toggleCorrection(idx: number) {
    setSelectedCorrections((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function selectAllCorrections() {
    if (!analysis) return
    setSelectedCorrections(new Set(analysis.corrections.map((_, i) => i)))
  }

  function deselectAllCorrections() {
    setSelectedCorrections(new Set())
  }

  // Chapters with analysis sorted by overall score desc
  const analyzedChapters = [...chapters]
    .filter((c) => analyses[c.id])
    .sort((a, b) => (analyses[b.id]?.scores.overall ?? 0) - (analyses[a.id]?.scores.overall ?? 0))

  const radarData = analysis
    ? Object.entries(SCORE_LABELS).map(([key, label]) => ({
        subject: label,
        value: analysis.scores[key as keyof typeof analysis.scores] as number,
        fullMark: 10,
      }))
    : []

  const tabs: {id: Tab; label: string; count?: number}[] = [
    {id: 'strengths', label: 'Punti di forza', count: analysis?.strengths.length},
    {id: 'weaknesses', label: 'Debolezze', count: analysis?.weaknesses.length},
    {id: 'suggestions', label: 'Suggerimenti', count: analysis?.suggestions.length},
    {id: 'corrections', label: 'Correzioni', count: analysis?.corrections.length},
    {id: 'editor', label: 'Editor'},
  ]

  return (
    <div className="space-y-6 p-6">

      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white">Analisi AI</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Feedback generato da Claude · {analyzedChapters.length}/{chapters.length} capitoli analizzati
          </p>
        </div>

        {/* Chapter selector */}
        <select
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value)
            setActiveTab('strengths')
          }}
          className="rounded-lg border border-white/8 bg-[#12121A] px-3 py-2 text-sm text-slate-300 outline-none focus:border-violet-500/40"
        >
          <option value="">— Seleziona capitolo —</option>
          {[...chapters].sort((a, b) => a.number - b.number).map((c) => (
            <option key={c.id} value={c.id}>
              {String(c.number).padStart(2, '0')} — {c.title}{analyses[c.id] ? ' ✓' : ''}
            </option>
          ))}
        </select>

        {/* Trigger chapter */}
        <button
          onClick={() => selectedId && void triggerAnalysis(selectedId)}
          disabled={!selectedId || triggering}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
        >
          {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Analizza
        </button>

        {/* Trigger all */}
        <button
          onClick={() => void triggerAnalysis('all')}
          disabled={triggering || chapters.length === 0}
          title="Analizza tutti i capitoli"
          className="flex items-center gap-2 rounded-lg border border-white/8 px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200 disabled:opacity-40"
        >
          <Sparkles className="h-4 w-4" />
          Tutti
        </button>

        {/* Refresh */}
        {selectedId && (
          <button
            onClick={() => void loadAnalysis(selectedId)}
            title="Ricarica analisi"
            className="rounded-lg border border-white/8 p-2 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
        )}
      </div>

      {/* Analysis panel */}
      <AnimatePresence mode="wait">
        {selectedId && (
          <motion.div
            key={selectedId}
            initial={{opacity: 0, y: 8}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0}}
            className="space-y-4"
          >
            {isLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
              </div>
            ) : analysis ? (
              <>
                {/* Score section */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  {/* Radar + overall */}
                  <div className="flex flex-col items-center gap-4 rounded-xl border border-white/8 bg-[#12121A] p-5">
                    <ProgressRing
                      value={analysis.scores.overall * 10}
                      size={96}
                      stroke={8}
                      label={analysis.scores.overall.toFixed(1)}
                      sublabel="overall"
                    />
                    <div className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={radarData} margin={{top: 4, right: 20, bottom: 4, left: 20}}>
                          <PolarGrid stroke="rgba(255,255,255,0.06)" />
                          <PolarAngleAxis dataKey="subject" tick={{fill: '#64748B', fontSize: 10}} />
                          <Radar
                            dataKey="value"
                            stroke="#7C3AED"
                            fill="#7C3AED"
                            fillOpacity={0.25}
                            dot={{fill: '#7C3AED', r: 2}}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-center text-xs text-slate-600">
                      {selectedChapter?.title} ·{' '}
                      {formatRelativeDate(analysis.analyzedAt)}
                    </p>
                    <p className="text-xs text-slate-700">{analysis.model}</p>
                  </div>

                  {/* Score bars + summary */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="rounded-xl border border-white/8 bg-[#12121A] p-5">
                      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Punteggi dettagliati
                      </h3>
                      <div className="space-y-3">
                        {Object.entries(SCORE_LABELS).map(([key, label]) => (
                          <ScoreBar
                            key={key}
                            label={label}
                            value={analysis.scores[key as keyof typeof analysis.scores] as number}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-[#12121A] p-5">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Sintesi</h3>
                      <p className="text-sm leading-relaxed text-slate-300">{analysis.summary}</p>
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <div className="rounded-xl border border-white/8 bg-[#12121A]">
                  <div className="flex overflow-x-auto border-b border-white/8">
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          'flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                          activeTab === tab.id
                            ? 'border-violet-500 text-violet-300'
                            : 'border-transparent text-slate-500 hover:text-slate-300'
                        )}
                      >
                        {tab.label}
                        {tab.count !== undefined && (
                          <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-xs">{tab.count}</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="p-5">
                    <AnimatePresence mode="wait">
                      {activeTab === 'strengths' || activeTab === 'weaknesses' || activeTab === 'suggestions' ? (
                        <motion.ul
                          key={activeTab}
                          initial={{opacity: 0, x: -4}}
                          animate={{opacity: 1, x: 0}}
                          exit={{opacity: 0}}
                          transition={{duration: 0.15}}
                          className="space-y-2"
                        >
                          {(activeTab === 'strengths'
                            ? analysis.strengths
                            : activeTab === 'weaknesses'
                              ? analysis.weaknesses
                              : analysis.suggestions
                          ).map((item, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-sm">
                              <span
                                className={cn(
                                  'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                                  activeTab === 'strengths'
                                    ? 'bg-emerald-500'
                                    : activeTab === 'weaknesses'
                                      ? 'bg-amber-500'
                                      : 'bg-blue-500'
                                )}
                              />
                              <span className="text-slate-300">{item}</span>
                            </li>
                          ))}
                          {(activeTab === 'strengths'
                            ? analysis.strengths
                            : activeTab === 'weaknesses'
                              ? analysis.weaknesses
                              : analysis.suggestions
                          ).length === 0 && (
                            <p className="text-sm text-slate-600">Nessun elemento disponibile.</p>
                          )}
                        </motion.ul>
                      ) : activeTab === 'corrections' ? (
                        <motion.div
                          key="corrections"
                          initial={{opacity: 0, x: -4}}
                          animate={{opacity: 1, x: 0}}
                          exit={{opacity: 0}}
                          transition={{duration: 0.15}}
                        >
                          {analysis.corrections.length === 0 ? (
                            <p className="text-sm text-slate-600">Nessuna correzione suggerita.</p>
                          ) : (
                            <div className="space-y-3">
                              {/* Already applied banner */}
                              {analysis.appliedAt && (
                                <div className="flex items-center gap-2 rounded-lg border border-emerald-800/30 bg-emerald-900/15 px-3 py-2">
                                  <CheckCheck className="h-3.5 w-3.5 text-emerald-400" />
                                  <span className="text-xs text-emerald-400">
                                    Correzioni applicate il {new Date(analysis.appliedAt).toLocaleDateString('it-IT')}
                                    {' '}· {analysis.acceptedCorrections?.length ?? 0} accettate,{' '}
                                    {analysis.rejectedCorrections?.length ?? 0} rifiutate
                                  </span>
                                </div>
                              )}

                              {/* Toolbar */}
                              {!selectedChapter?.driveContent && (
                                <p className="text-xs text-amber-400 rounded-lg border border-amber-800/30 bg-amber-900/10 px-3 py-2">
                                  Nessun testo disponibile — sincronizza il capitolo da Drive per applicare le correzioni
                                </p>
                              )}
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  onClick={selectAllCorrections}
                                  className="flex items-center gap-1.5 rounded-md border border-white/8 px-2.5 py-1 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
                                >
                                  <CheckCheck className="h-3 w-3" />
                                  Seleziona tutte
                                </button>
                                <button
                                  onClick={deselectAllCorrections}
                                  className="flex items-center gap-1.5 rounded-md border border-white/8 px-2.5 py-1 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
                                >
                                  <Square className="h-3 w-3" />
                                  Deseleziona
                                </button>
                                {selectedCorrections.size > 0 && (
                                  <span className="text-xs text-slate-500">
                                    {selectedCorrections.size} selezionat{selectedCorrections.size === 1 ? 'a' : 'e'}
                                  </span>
                                )}
                                <div className="flex-1" />
                                <button
                                  onClick={() => void handleApplyCorrections()}
                                  disabled={
                                    selectedCorrections.size === 0 ||
                                    isApplying ||
                                    !selectedChapter?.driveContent
                                  }
                                  className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
                                >
                                  {isApplying ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <FileEdit className="h-3 w-3" />
                                  )}
                                  Applica {selectedCorrections.size > 0 ? selectedCorrections.size : ''} correzioni
                                </button>
                              </div>

                              {/* Correction list */}
                              {analysis.corrections.map((c, i) => {
                                const isSelected = selectedCorrections.has(i)
                                const wasAccepted = analysis.acceptedCorrections?.includes(i)
                                const wasRejected = analysis.rejectedCorrections?.includes(i)
                                return (
                                  <div
                                    key={i}
                                    onClick={() => toggleCorrection(i)}
                                    className={cn(
                                      'cursor-pointer rounded-lg border p-4 space-y-3 transition-colors',
                                      isSelected
                                        ? 'border-violet-600/50 bg-violet-900/15'
                                        : 'border-white/6 hover:border-white/10 hover:bg-white/2'
                                    )}
                                  >
                                    <div className="flex items-center gap-2">
                                      {/* Checkbox */}
                                      <div
                                        className={cn(
                                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                                          isSelected
                                            ? 'border-violet-500 bg-violet-600'
                                            : 'border-white/20 bg-transparent'
                                        )}
                                      >
                                        {isSelected && <X className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                                      </div>
                                      <span
                                        className={cn(
                                          'inline-flex rounded-full border px-2 py-0.5 text-xs',
                                          CORRECTION_TYPE_COLORS[c.type] ?? 'border-white/8 bg-white/8 text-slate-400'
                                        )}
                                      >
                                        {CORRECTION_TYPE_LABELS[c.type] ?? c.type}
                                      </span>
                                      {wasAccepted && (
                                        <span className="ml-auto text-xs text-emerald-500">✓ accettata</span>
                                      )}
                                      {wasRejected && (
                                        <span className="ml-auto text-xs text-slate-600">✗ rifiutata</span>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                      <div>
                                        <p className="mb-1 text-slate-600">Originale</p>
                                        <p className="rounded-lg bg-red-950/20 p-2.5 text-slate-400 line-through">
                                          {c.original}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="mb-1 text-slate-600">Suggerito</p>
                                        <p className="rounded-lg bg-emerald-950/20 p-2.5 text-emerald-300">
                                          {c.suggested}
                                        </p>
                                      </div>
                                    </div>
                                    {c.note && (
                                      <p className="text-xs text-slate-600 italic">{c.note}</p>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </motion.div>
                      ) : (
                        /* Editor tab */
                        <motion.div
                          key="editor"
                          initial={{opacity: 0, x: -4}}
                          animate={{opacity: 1, x: 0}}
                          exit={{opacity: 0}}
                          transition={{duration: 0.15}}
                          className="space-y-3"
                        >
                          {!selectedChapter?.driveContent && !editorContent ? (
                            <p className="text-xs text-amber-400 rounded-lg border border-amber-800/30 bg-amber-900/10 px-3 py-2">
                              Nessun testo sincronizzato da Drive. Sincronizza il capitolo nelle Impostazioni.
                            </p>
                          ) : null}

                          {/* lastSyncAt + reload */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-600">
                              {selectedChapter?.lastSyncAt
                                ? `Contenuto aggiornato ${formatRelativeDate(selectedChapter.lastSyncAt)}`
                                : 'Nessuna sincronizzazione registrata'}
                            </span>
                            {selectedChapter?.driveFileId && driveConfig?.folderId && (
                              <button
                                onClick={() => void handleReloadFromDrive()}
                                disabled={isForceSyncingDrive}
                                className="flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-300 disabled:opacity-50"
                              >
                                <RefreshCw className={cn('h-3 w-3', isForceSyncingDrive && 'animate-spin')} />
                                Ricarica da Drive
                              </button>
                            )}
                          </div>

                          <textarea
                            ref={editorRef}
                            value={editorContent}
                            onChange={(e) => setEditorContent(e.target.value)}
                            placeholder="Il testo del capitolo apparirà qui dopo la sincronizzazione Drive..."
                            className="w-full min-h-[400px] resize-y rounded-lg border border-white/8 bg-white/3 px-4 py-3 font-mono text-sm text-slate-300 placeholder-slate-700 focus:border-violet-500/40 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
                            spellCheck={false}
                          />
                          <div className="flex items-center justify-between">
                            <div className="flex gap-4 text-xs text-slate-600">
                              <span>{editorContent.length.toLocaleString('it-IT')} caratteri</span>
                              <span>{editorContent.split(/\s+/).filter(Boolean).length.toLocaleString('it-IT')} parole</span>
                            </div>
                            <button
                              onClick={() => void handleSaveEditorContent()}
                              disabled={isSavingContent || !editorContent}
                              className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
                            >
                              {isSavingContent ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <FileEdit className="h-4 w-4" />
                              )}
                              Salva su Firestore
                            </button>
                          </div>
                          <p className="text-xs text-slate-600">
                            Il testo viene salvato su Firestore come bozza locale. Usa "Sincronizza ora" nelle Impostazioni per inviarlo su Drive.
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </>
            ) : (
              /* No analysis */
              <div className="rounded-xl border border-dashed border-white/8 py-16 text-center">
                <RadarIcon className="mx-auto mb-3 h-10 w-10 text-slate-700" />
                <p className="text-sm font-medium text-slate-400">Nessuna analisi disponibile</p>
                <p className="mt-1 text-xs text-slate-600 mb-5">
                  Avvia il workflow GitHub Actions per analizzare questo capitolo
                </p>
                <button
                  onClick={() => void triggerAnalysis(selectedId)}
                  disabled={triggering}
                  className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
                >
                  {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Avvia analisi
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comparison table */}
      {analyzedChapters.length > 0 && (
        <motion.div
          initial={{opacity: 0, y: 8}}
          animate={{opacity: 1, y: 0}}
          transition={{delay: 0.1}}
          className="rounded-xl border border-white/8 bg-[#12121A]"
        >
          <div className="border-b border-white/8 px-5 py-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Confronto capitoli — {analyzedChapters.length} analizzati
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/6 text-xs text-slate-600">
                  <th className="px-5 py-2.5 text-left font-medium">Capitolo</th>
                  {Object.values(SCORE_LABELS).map((l) => (
                    <th key={l} className="px-3 py-2.5 text-center font-medium">{l}</th>
                  ))}
                  <th className="px-5 py-2.5 text-center font-medium">Overall</th>
                </tr>
              </thead>
              <tbody>
                {analyzedChapters.map((c) => {
                  const a = analyses[c.id]!
                  return (
                    <tr
                      key={c.id}
                      onClick={() => {
                        setSelectedId(c.id)
                        setActiveTab('strengths')
                        window.scrollTo({top: 0, behavior: 'smooth'})
                      }}
                      className={cn(
                        'cursor-pointer border-b border-white/4 transition-colors hover:bg-white/4',
                        selectedId === c.id && 'bg-violet-900/10'
                      )}
                    >
                      <td className="px-5 py-3">
                        <span className="mr-2 text-xs text-slate-600">
                          {String(c.number).padStart(2, '0')}
                        </span>
                        <span className="text-slate-300">{c.title}</span>
                      </td>
                      {Object.keys(SCORE_LABELS).map((key) => {
                        const val = a.scores[key as keyof typeof a.scores] as number
                        return (
                          <td key={key} className={cn('px-3 py-3 text-center text-xs font-medium', getScoreColor(val))}>
                            {val.toFixed(1)}
                          </td>
                        )
                      })}
                      <td className="px-5 py-3 text-center">
                        <span className={cn('text-sm font-bold', getScoreColor(a.scores.overall))}>
                          {a.scores.overall.toFixed(1)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Empty state */}
      {chapters.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/8 py-16 text-center">
          <Sparkles className="mx-auto mb-3 h-10 w-10 text-slate-700" />
          <p className="text-sm font-medium text-slate-400">Nessun capitolo trovato</p>
          <p className="mt-1 text-xs text-slate-600">Vai al Kanban per aggiungere capitoli</p>
        </div>
      )}
    </div>
  )
}
