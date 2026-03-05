import {useEffect, useRef, useState} from 'react'
import {AnimatePresence, motion} from 'framer-motion'
import {CheckCheck, FileEdit, Loader2, Play, RadarIcon, RefreshCw, Sparkles, Square, X} from 'lucide-react'
import {PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer} from 'recharts'
import {useChaptersStore} from '@/stores/chaptersStore'
import {useAnalysisStore} from '@/stores/analysisStore'
import {useDriveStore} from '@/stores/driveStore'
import {useAuthStore} from '@/stores/authStore'
import {useSettingsStore} from '@/stores/settingsStore'
import {toast} from '@/stores/toastStore'
import type {AnalysisCorrection} from '@/types'
import {getScoreColor, SyncSource, SyncStatus} from '@/types'
import type {WorkflowRunInfo} from '@/services/githubWorkflow'
import {getLatestWorkflowRun, triggerWorkflow} from '@/services/githubWorkflow'
import {patchAnalysis} from '@/services/analysisService'
import * as chaptersService from '@/services/chaptersService'
import {getValidAccessToken} from '@/services/driveAuthService'
import {getDriveFileContent} from '@/services/driveFileService'
import {parseYamlFrontmatter} from '@/services/driveParserService'
import {pushToDrive} from '@/services/driveSyncService'
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

// ─── Pending analysis (localStorage persistence) ──────────────────────────────

const LS_PENDING_KEY = 'book_pending_analysis'

interface PendingAnalysis {
  chapterId: string
  chapterTitle: string
  triggeredAt: string
}

function loadPending(): PendingAnalysis | null {
  try {
    const raw = localStorage.getItem(LS_PENDING_KEY)
    return raw ? (JSON.parse(raw) as PendingAnalysis) : null
  } catch { return null }
}

function savePending(p: PendingAnalysis | null) {
  if (p) localStorage.setItem(LS_PENDING_KEY, JSON.stringify(p))
  else localStorage.removeItem(LS_PENDING_KEY)
}

function formatElapsed(secs: number): string {
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}m ${s > 0 ? ` ${s}s` : ''}`
}

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findContext(text: string, phrase: string, pad = 60): string | null {
  const idx = text.indexOf(phrase)
  if (idx === -1) return null
  const start = Math.max(0, idx - pad)
  const end = Math.min(text.length, idx + phrase.length + pad)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ItemModal({
  type,
  text,
  onClose,
}: {
  type: 'weaknesses' | 'suggestions'
  text: string
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{opacity: 0, scale: 0.95}}
        animate={{opacity: 1, scale: 1}}
        exit={{opacity: 0, scale: 0.95}}
        transition={{duration: 0.15}}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <span className={cn(
            'rounded-full px-3 py-1 text-xs font-semibold',
            type === 'weaknesses'
              ? 'bg-amber-900/30 text-amber-400 border border-amber-800/30'
              : 'bg-blue-900/30 text-blue-400 border border-blue-800/30'
          )}>
            {type === 'weaknesses' ? 'Punto debole' : 'Suggerimento'}
          </span>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:text-slate-300">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-5 text-sm leading-relaxed text-[var(--text-primary)]">{text}</p>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--overlay)] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Come applicarlo</p>
          <ul className="space-y-2 text-sm text-slate-400">
            {type === 'suggestions' ? (
              <>
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />Vai nella tab <strong className="text-slate-300">Editor</strong> e individua la parte interessata</li>
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />Riscrivi il passaggio tenendo a mente questo suggerimento</li>
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />Salva su Drive quando sei soddisfatto</li>
              </>
            ) : (
              <>
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />Identifica i passaggi specifici che mostrano questa debolezza</li>
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />Controlla anche la tab <strong className="text-slate-300">Correzioni</strong> per errori correlati</li>
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />Dopo la revisione, rilancia l'analisi per verificare il miglioramento</li>
              </>
            )}
          </ul>
        </div>
      </motion.div>
    </div>
  )
}

function ScoreBar({label, value}: {label: string; value: number}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-slate-400">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-[var(--overlay)] overflow-hidden">
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
  const {config: driveConfig, patchTokens, load: loadDrive} = useDriveStore()
  const {user} = useAuthStore()
  const {loadSettings} = useSettingsStore()
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
  const [isPushingToDrive, setIsPushingToDrive] = useState(false)
  const [appliedChanges, setAppliedChanges] = useState<Array<{original: string; suggested: string}>>([])
  const [itemDetailModal, setItemDetailModal] = useState<{type: 'weaknesses' | 'suggestions'; text: string} | null>(null)
  // Pending analysis progress
  const [pendingAnalysis, setPendingAnalysis] = useState<PendingAnalysis | null>(() => loadPending())
  const [workflowRun, setWorkflowRun] = useState<WorkflowRunInfo | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const isApplyingRef = useRef(false)

  useEffect(() => {
    void loadChapters()
    void loadSettings()
  }, [loadChapters, loadSettings])

  // Load drive config if not already in store
  useEffect(() => {
    if (user && !driveConfig) void loadDrive(user.uid)
  }, [user, driveConfig, loadDrive])

  useEffect(() => {
    if (chapters.length > 0) void loadAllAnalyses()
  }, [chapters, loadAllAnalyses])

  // Reset editor + corrections when switching chapter
  useEffect(() => {
    if (selectedId) void loadAnalysis(selectedId)
    setSelectedCorrections(new Set())
    setAppliedChanges([])
    const chapter = chapters.find((c) => c.id === selectedId)
    setEditorContent(chapter?.driveContent ?? '')
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync editor content when driveContent changes (e.g. after Drive pull)
  // but not while we're in the middle of applying corrections
  useEffect(() => {
    if (isApplyingRef.current) return
    const chapter = chapters.find((c) => c.id === selectedId)
    if (chapter) setEditorContent(chapter.driveContent ?? '')
  }, [chapters, selectedId])

  // ─── Analysis progress polling ────────────────────────────────────────────
  useEffect(() => {
    if (!pendingAnalysis) {
      setElapsedSeconds(0)
      return
    }
    // Capture in local const so TypeScript/closures treat it as non-null
    const pending = pendingAnalysis
    setElapsedSeconds(Math.floor((Date.now() - new Date(pending.triggeredAt).getTime()) / 1000))
    const tickId = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - new Date(pending.triggeredAt).getTime()) / 1000))
    }, 1000)

    async function poll() {
      try {
        const run = await getLatestWorkflowRun(GITHUB_REPO_OWNER, GITHUB_REPO_NAME, 'ai-analysis.yml')
        if (run) setWorkflowRun(run)

        if (pending.chapterId === 'all') {
          await loadAllAnalyses()
        } else {
          await loadAnalysis(pending.chapterId)
        }
        const freshAnalyses = useAnalysisStore.getState().analyses
        const isComplete =
          pending.chapterId === 'all'
            ? Object.values(freshAnalyses).some(
                (a) => a && new Date(a.analyzedAt) > new Date(pending.triggeredAt),
              )
            : !!freshAnalyses[pending.chapterId] &&
              new Date(freshAnalyses[pending.chapterId]!.analyzedAt) > new Date(pending.triggeredAt)

        if (isComplete) {
          toast.success(`Analisi completata per "${pending.chapterTitle}"!`)
          if (pending.chapterId !== 'all') {
            setSelectedId(pending.chapterId)
            setActiveTab('strengths')
            window.scrollTo({top: 0, behavior: 'smooth'})
          }
          savePending(null)
          setPendingAnalysis(null)
          setWorkflowRun(null)
          return
        }

        if (run?.conclusion === 'failure') {
          toast.error(`Analisi fallita per "${pending.chapterTitle}"`)
          savePending(null)
          setPendingAnalysis(null)
          setWorkflowRun(null)
          return
        }

        // Timeout after 10 minutes
        if (Date.now() - new Date(pending.triggeredAt).getTime() > 10 * 60 * 1000) {
          toast.warning(`Timeout analisi "${pending.chapterTitle}" — controlla GitHub Actions`)
          savePending(null)
          setPendingAnalysis(null)
          setWorkflowRun(null)
        }
      } catch {
        // Ignore transient poll errors
      }
    }

    void poll()
    const pollId = setInterval(() => void poll(), 15_000)
    return () => {
      clearInterval(tickId)
      clearInterval(pollId)
    }
  }, [pendingAnalysis, loadAnalysis, loadAllAnalyses])

  const selectedChapter = chapters.find((c) => c.id === selectedId) ?? null
  const analysis = selectedId ? (analyses[selectedId] ?? null) : null
  const isDirty = editorContent !== (selectedChapter?.driveContent ?? '')
  const isPendingPush = isDirty || selectedChapter?.syncStatus === SyncStatus.PENDING_PUSH
  const isGoogleDoc = selectedChapter?.driveMimeType === 'application/vnd.google-apps.document'

  async function triggerAnalysis(chapterId: string) {
    const hasExisting =
      chapterId === 'all'
        ? Object.keys(analyses).length > 0
        : !!analyses[chapterId]
    if (hasExisting) {
      const label =
        chapterId === 'all'
          ? 'Alcuni capitoli hanno già un\'analisi salvata'
          : `Il capitolo ha già un'analisi del ${formatRelativeDate(analyses[chapterId]!.analyzedAt)}`
      const ok = confirm(`${label}.\n\nRieseguire l'analisi sovrascriverà i risultati esistenti e consumerà token Claude.\n\nContinuare?`)
      if (!ok) return
    }
    setTriggering(true)
    try {
      await triggerWorkflow(GITHUB_REPO_OWNER, GITHUB_REPO_NAME, 'ai-analysis.yml', {
        chapter_id: chapterId,
      })
      const chapterTitle =
        chapterId === 'all'
          ? 'tutti i capitoli'
          : (chapters.find((c) => c.id === chapterId)?.title ?? chapterId)
      const pending: PendingAnalysis = {chapterId, chapterTitle, triggeredAt: new Date().toISOString()}
      savePending(pending)
      setPendingAnalysis(pending)
      setElapsedSeconds(0)
      toast.success(`Analisi avviata per "${chapterTitle}"! Monitoraggio automatico attivato.`)
    } catch (err) {
      toast.error('Errore: ' + (err as Error).message)
    } finally {
      setTriggering(false)
    }
  }

  async function handleApplyCorrections() {
    if (!selectedChapter || !analysis || selectedCorrections.size === 0) return
    setIsApplying(true)
    isApplyingRef.current = true
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

      // Scritture in parallelo per ridurre la latenza
      await Promise.all([
        chaptersService.updateChapter(selectedChapter.id, {
          driveContent: content,
          syncStatus: SyncStatus.PENDING_PUSH,
          syncSource: SyncSource.AI,
        }),
        patchAnalysis(selectedChapter.id, {
          acceptedCorrections: accepted,
          rejectedCorrections: rejected,
          appliedAt: new Date().toISOString(),
        }),
      ])
      await Promise.all([loadChapters(), loadAnalysis(selectedId)])

      // Salva le modifiche per mostrarle nell'editor
      const changes = accepted
        .map((i) => analysis.corrections[i])
        .filter((c) => !!c && baseContent.includes(c.original))
        .map((c) => ({original: c!.original, suggested: c!.suggested}))
      setAppliedChanges(changes)
      setEditorContent(content)
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
      isApplyingRef.current = false
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

  async function handlePushToDrive() {
    if (!selectedChapter || !driveConfig || !user) return
    setIsPushingToDrive(true)
    try {
      await chaptersService.updateChapter(selectedChapter.id, {
        driveContent: editorContent,
        currentChars: editorContent.length,
        wordCount: editorContent.split(/\s+/).filter(Boolean).length,
        syncStatus: SyncStatus.PENDING_PUSH,
        syncSource: SyncSource.MANUAL,
      })
      const updated = {...selectedChapter, driveContent: editorContent}
      await pushToDrive(updated, driveConfig, user.uid, (tokens) => patchTokens(user.uid, tokens))
      await loadChapters()
      toast.success('Testo salvato su Drive')
    } catch (err) {
      const msg = (err as Error).message
      if (msg === 'GOOGLE_DOC_READONLY') {
        toast.info('File Google Doc: le modifiche sono salvate qui nell\'app. Applicale manualmente nel documento Google.')
      } else {
        toast.error('Errore salvataggio Drive: ' + msg)
      }
    } finally {
      setIsPushingToDrive(false)
    }
  }

  async function handleReloadFromDrive() {
    if (!selectedChapter?.driveFileId || !driveConfig || !user) return
    setIsForceSyncingDrive(true)
    try {
      const {accessToken, updatedTokens} = await getValidAccessToken(driveConfig, user.uid)
      if (updatedTokens) await patchTokens(user.uid, updatedTokens)
      const rawContent = await getDriveFileContent(accessToken, selectedChapter.driveFileId, selectedChapter.driveMimeType ?? 'text/plain')
      const { body: bodyContent } = parseYamlFrontmatter(rawContent)
      await chaptersService.updateChapter(selectedChapter.id, {
        driveContent: bodyContent,
        currentChars: bodyContent.length,
        wordCount: bodyContent.split(/\s+/).filter(Boolean).length,
        syncStatus: SyncStatus.SYNCED,
        syncSource: SyncSource.DRIVE,
        lastSyncAt: new Date().toISOString(),
      })
      await loadChapters()
      setEditorContent(bodyContent)
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
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Analisi AI</h1>
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
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-slate-300 outline-none focus:border-violet-500/40"
        >
          <option value="">— Seleziona capitolo —</option>
          {[...chapters].filter((c) => c.title.toLowerCase().startsWith('capitolo')).sort((a, b) => a.title.localeCompare(b.title, 'it')).map((c) => (
            <option key={c.id} value={c.id}>
              {String(c.number).padStart(2, '0')} — {c.title}{analyses[c.id] ? ' ✓' : ''}
            </option>
          ))}
        </select>

        {/* Trigger chapter */}
        <button
          onClick={() => selectedId && void triggerAnalysis(selectedId)}
          disabled={!selectedId || triggering || pendingAnalysis?.chapterId === selectedId}
          title={pendingAnalysis?.chapterId === selectedId ? 'Analisi già in corso per questo capitolo' : undefined}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
        >
          {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Analizza
        </button>

        {/* Trigger all */}
        <button
          onClick={() => void triggerAnalysis('all')}
          disabled={triggering || chapters.length === 0 || pendingAnalysis?.chapterId === 'all'}
          title="Analizza tutti i capitoli"
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-[var(--overlay)] hover:text-slate-200 disabled:opacity-40"
        >
          <Sparkles className="h-4 w-4" />
          Tutti
        </button>

        {/* Refresh */}
        {selectedId && (
          <button
            onClick={() => void loadAnalysis(selectedId)}
            title="Ricarica analisi"
            className="rounded-lg border border-[var(--border)] p-2 text-slate-500 transition-colors hover:bg-[var(--overlay)] hover:text-slate-300"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
        )}
      </div>

      {/* Pending analysis banner */}
      <AnimatePresence>
        {pendingAnalysis && (
          <motion.div
            key="pending-banner"
            initial={{opacity: 0, y: -8}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: -8}}
            className="flex items-center gap-3 rounded-xl border border-violet-800/40 bg-violet-900/20 px-4 py-3"
          >
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-violet-300">
                Analisi in corso — {pendingAnalysis.chapterTitle}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {workflowRun ? (
                  <>
                    GitHub Actions:{' '}
                    <span className={
                      workflowRun.status === 'in_progress' ? 'text-amber-400' :
                      workflowRun.status === 'queued' ? 'text-blue-400' : 'text-slate-400'
                    }>
                      {workflowRun.status === 'queued' ? 'In coda' :
                       workflowRun.status === 'in_progress' ? 'In esecuzione' :
                       workflowRun.status}
                    </span>
                    {' · '}
                  </>
                ) : null}
                Avviata {formatElapsed(elapsedSeconds)} fa · aggiornamento ogni 15s
              </p>
            </div>
            <button
              onClick={() => {savePending(null); setPendingAnalysis(null); setWorkflowRun(null)}}
              title="Chiudi monitoraggio"
              className="rounded p-1 text-slate-600 transition-colors hover:text-slate-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

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
            {isLoading && !analysis ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
              </div>
            ) : analysis ? (
              <>
                {/* Score section */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  {/* Radar + overall */}
                  <div className="flex flex-col items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
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
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
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
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Sintesi</h3>
                      <p className="text-sm leading-relaxed text-slate-300">{analysis.summary}</p>
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                  <div className="flex overflow-x-auto border-b border-[var(--border)]">
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
                          <span className="rounded-full bg-[var(--overlay)] px-1.5 py-0.5 text-xs">{tab.count}</span>
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
                          ).map((item, i) => {
                            const isClickable = activeTab === 'weaknesses' || activeTab === 'suggestions'
                            return (
                              <li
                                key={i}
                                onClick={isClickable ? () => setItemDetailModal({type: activeTab as 'weaknesses' | 'suggestions', text: item}) : undefined}
                                className={cn(
                                  'flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm',
                                  isClickable && 'cursor-pointer transition-colors hover:bg-[var(--overlay)]'
                                )}
                              >
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
                                <span className="flex-1 text-slate-300">{item}</span>
                                {isClickable && (
                                  <span className="shrink-0 text-xs text-slate-600 mt-0.5">dettagli →</span>
                                )}
                              </li>
                            )
                          })}
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
                                  className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-slate-400 transition-colors hover:bg-[var(--overlay)] hover:text-slate-200"
                                >
                                  <CheckCheck className="h-3 w-3" />
                                  Seleziona tutte
                                </button>
                                <button
                                  onClick={deselectAllCorrections}
                                  className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-slate-400 transition-colors hover:bg-[var(--overlay)] hover:text-slate-200"
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
                                        : 'border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--overlay)]'
                                    )}
                                  >
                                    <div className="flex items-center gap-2">
                                      {/* Checkbox */}
                                      <div
                                        className={cn(
                                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                                          isSelected
                                            ? 'border-violet-500 bg-violet-600'
                                            : 'border-[var(--border-strong)] bg-transparent'
                                        )}
                                      >
                                        {isSelected && <X className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                                      </div>
                                      <span
                                        className={cn(
                                          'inline-flex rounded-full border px-2 py-0.5 text-xs',
                                          CORRECTION_TYPE_COLORS[c.type] ?? 'border-[var(--border)] bg-[var(--overlay)] text-slate-400'
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
                                    {/* Contesto nel testo */}
                                    {(() => {
                                      const ctx = selectedChapter?.driveContent
                                        ? findContext(selectedChapter.driveContent, c.original)
                                        : null
                                      if (!ctx) return null
                                      const parts = ctx.split(c.original)
                                      return (
                                        <div className="rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-3 py-2 text-xs text-slate-500">
                                          <p className="mb-1 text-slate-600">Contesto nel testo</p>
                                          <p className="leading-relaxed">
                                            {parts[0]}
                                            <mark className="rounded bg-amber-900/40 px-0.5 text-amber-300 not-italic">{c.original}</mark>
                                            {parts.slice(1).join(c.original)}
                                          </p>
                                        </div>
                                      )
                                    })()}
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
                            onChange={(e) => { setEditorContent(e.target.value); setAppliedChanges([]) }}
                            placeholder="Il testo del capitolo apparirà qui dopo la sincronizzazione Drive..."
                            className="w-full min-h-[400px] resize-y rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-4 py-3 font-mono text-sm text-slate-300 placeholder-slate-700 focus:border-violet-500/40 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
                            spellCheck={false}
                          />

                          {/* Pannello modifiche applicate */}
                          {appliedChanges.length > 0 && (
                            <div className="rounded-xl border border-emerald-800/30 bg-emerald-900/10 p-4 space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-500">
                                {appliedChanges.length} modifiche applicate al testo
                              </p>
                              {appliedChanges.map((ch, i) => (
                                <div key={i} className="grid grid-cols-2 gap-2 text-xs">
                                  <p className="rounded bg-red-950/30 px-2 py-1.5 text-slate-500 line-through">{ch.original}</p>
                                  <p className="rounded bg-emerald-950/30 px-2 py-1.5 text-emerald-300">{ch.suggested}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center justify-between">
                            <div className="flex gap-4 text-xs text-slate-600">
                              <span>{editorContent.length.toLocaleString('it-IT')} caratteri</span>
                              <span>{editorContent.split(/\s+/).filter(Boolean).length.toLocaleString('it-IT')} parole</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {/* Stato sync */}
                              {!isDirty && (
                                <span className="flex items-center gap-1 text-xs text-emerald-600">
                                  <CheckCheck className="h-3 w-3" />
                                  Nessuna modifica
                                </span>
                              )}
                              {isDirty && (
                                <span className="flex items-center gap-1 text-xs text-amber-500">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                  Modifiche non salvate
                                </span>
                              )}
                              {/* Salva su Drive */}
                              {isGoogleDoc && (
                                <span className="rounded-lg border border-amber-800/30 bg-amber-900/20 px-3 py-1.5 text-xs text-amber-400">
                                  Google Doc — modifiche salvate in app, applica manualmente nel Doc
                                </span>
                              )}
                              {driveConfig?.folderId && !isGoogleDoc && (
                                <button
                                  onClick={() => void handlePushToDrive()}
                                  disabled={isPushingToDrive || !editorContent || !isPendingPush}
                                  className={cn(
                                    'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-40',
                                    isPendingPush
                                      ? 'bg-amber-600 hover:bg-amber-500'
                                      : 'bg-slate-700 hover:bg-slate-600'
                                  )}
                                >
                                  {isPushingToDrive ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <FileEdit className="h-4 w-4" />
                                  )}
                                  Salva su Drive{isPendingPush ? ' *' : ''}
                                </button>
                              )}
                              {!driveConfig?.folderId && (
                                <button
                                  onClick={() => void handleSaveEditorContent()}
                                  disabled={isSavingContent || !editorContent || !isDirty}
                                  className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
                                >
                                  {isSavingContent ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileEdit className="h-4 w-4" />}
                                  Salva bozza{isDirty ? ' *' : ''}
                                </button>
                              )}
                            </div>
                          </div>
                          {!driveConfig?.folderId && (
                            <p className="text-xs text-slate-600">
                              Drive non connesso — il testo viene salvato come bozza su Firestore.
                            </p>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </>
            ) : (
              /* No analysis */
              <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
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

      {/* Item detail modal */}
      <AnimatePresence>
        {itemDetailModal && (
          <ItemModal
            type={itemDetailModal.type}
            text={itemDetailModal.text}
            onClose={() => setItemDetailModal(null)}
          />
        )}
      </AnimatePresence>

      {/* Comparison table */}
      {analyzedChapters.length > 0 && (
        <motion.div
          initial={{opacity: 0, y: 8}}
          animate={{opacity: 1, y: 0}}
          transition={{delay: 0.1}}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]"
        >
          <div className="border-b border-[var(--border)] px-5 py-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Confronto capitoli — {analyzedChapters.length} analizzati
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs text-slate-600">
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
                        'cursor-pointer border-b border-[var(--border)] transition-colors hover:bg-[var(--overlay)]',
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
        <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
          <Sparkles className="mx-auto mb-3 h-10 w-10 text-slate-700" />
          <p className="text-sm font-medium text-slate-400">Nessun capitolo trovato</p>
          <p className="mt-1 text-xs text-slate-600">Vai al Kanban per aggiungere capitoli</p>
        </div>
      )}
    </div>
  )
}
