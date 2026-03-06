import React, {useEffect, useRef, useState} from 'react'
import {AnimatePresence, motion} from 'framer-motion'
import {
  AlertTriangle,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  FileEdit,
  History,
  Loader2,
  Play,
  RadarIcon,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  TrendingUp,
  X
} from 'lucide-react'
import {PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer} from 'recharts'
import {useChaptersStore} from '@/stores/chaptersStore'
import {useAnalysisStore} from '@/stores/analysisStore'
import {useDriveStore} from '@/stores/driveStore'
import {useAuthStore} from '@/stores/authStore'
import {useSettingsStore} from '@/stores/settingsStore'
import {toast} from '@/stores/toastStore'
import type {AIProvider} from '@/types'
import {AI_PROVIDER_CONFIG, getScoreColor, SyncSource, SyncStatus} from '@/types'
import type {WorkflowRunInfo} from '@/services/githubWorkflow'
import {getLatestWorkflowRun, triggerWorkflow} from '@/services/githubWorkflow'
import {checkAnalysisAfter, checkErrorAfter, patchAnalysis} from '@/services/analysisService'
import * as chaptersService from '@/services/chaptersService'
import {getValidAccessToken} from '@/services/driveAuthService'
import {getDriveFileContent} from '@/services/driveFileService'
import {parseYamlFrontmatter} from '@/services/driveParserService'
import {pushToDrive} from '@/services/driveSyncService'
import {applyTextReplacements} from '@/services/googleDocsService'
import {GITHUB_REPO_NAME, GITHUB_REPO_OWNER} from '@/utils/constants'
import {formatRelativeDate} from '@/utils/formatters'
import {cn} from '@/utils/cn'
import {applyCorrectionsToContent} from '@/utils/corrections'
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

type Tab = 'strengths' | 'weaknesses' | 'suggestions' | 'corrections' | 'editor' | 'storico' | 'reazioni'

// ─── Author comment (localStorage persistence per capitolo) ──────────────────

const LS_AUTHOR_COMMENT_KEY = 'book_author_comments'

function loadAuthorComments(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_AUTHOR_COMMENT_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch { return {} }
}

function saveAuthorComment(chapterId: string, comment: string) {
  const all = loadAuthorComments()
  if (comment.trim()) {
    all[chapterId] = comment
  } else {
    delete all[chapterId]
  }
  localStorage.setItem(LS_AUTHOR_COMMENT_KEY, JSON.stringify(all))
}

function getAuthorComment(chapterId: string): string {
  return loadAuthorComments()[chapterId] ?? ''
}

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
  item,
  chapterContent,
  onClose,
}: {
  type: 'weaknesses' | 'suggestions'
  item: string | {text: string; quotes?: string[]}
  chapterContent: string
  onClose: () => void
}) {
  const text = typeof item === 'string' ? item : item.text
  const quotes = typeof item === 'string' ? [] : (item.quotes ?? [])

  // Cerca contesti aggiuntivi nel testo reale se non ci sono citazioni
  const extraContexts: string[] = []
  if (quotes.length === 0 && chapterContent) {
    // Estrai parole chiave dalla debolezza e cerca nel testo
    const keywords = text
      .split(/[.,;:!?—–\-\s]+/)
      .filter((w) => w.length > 5)
      .slice(0, 4)
    for (const kw of keywords) {
      const ctx = findContext(chapterContent, kw, 80)
      if (ctx && !extraContexts.some((e) => e.includes(kw))) {
        extraContexts.push(ctx)
        if (extraContexts.length >= 2) break
      }
    }
  }

  const allQuotes = quotes.length > 0 ? quotes : extraContexts

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
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-6 shadow-2xl"
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

        {/* Citazioni dal testo */}
        {allQuotes.length > 0 && (
          <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--overlay)] p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {quotes.length > 0 ? 'Esempi dal tuo testo' : 'Passaggi potenzialmente correlati'}
            </p>
            <div className="space-y-3">
              {allQuotes.map((q, i) => (
                <blockquote
                  key={i}
                  className="border-l-2 border-amber-500/40 pl-3 text-sm italic leading-relaxed text-slate-300"
                >
                  &ldquo;{q}&rdquo;
                </blockquote>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-[var(--border)] bg-[var(--overlay)] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Come applicarlo</p>
          <ul className="space-y-2 text-sm text-slate-300">
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
  const {analyses, loadAnalysis, loadAllAnalyses, analysisErrors, loadAnalysisErrors, history: analysisHistory, loadChapterHistory, deleteAnalysis, deleteHistoryEntry, isLoading} = useAnalysisStore()
  const {config: driveConfig, patchTokens, load: loadDrive} = useDriveStore()
  const {user} = useAuthStore()
  const {settings, loadSettings} = useSettingsStore()
  const [selectedId, setSelectedId] = useState<string>('')
  const [activeTab, setActiveTab] = useState<Tab>('strengths')
  const [activeProvider, setActiveProvider] = useState<AIProvider>((settings.defaultAIProvider ?? 'claude') as AIProvider)
  const [triggering, setTriggering] = useState(false)
  // Correzioni — 3 stati: accettata / rifiutata / da rivedere (default)
  const [acceptedCorrections, setAcceptedCorrections] = useState<Set<number>>(new Set())
  const [rejectedCorrections, setRejectedCorrections] = useState<Set<number>>(new Set())
  const [isApplying, setIsApplying] = useState(false)
  // Editor inline
  const [editorContent, setEditorContent] = useState('')
  const [isSavingContent, setIsSavingContent] = useState(false)
  const [isForceSyncingDrive, setIsForceSyncingDrive] = useState(false)
  const [isPushingToDrive, setIsPushingToDrive] = useState(false)
  const [appliedChanges, setAppliedChanges] = useState<Array<{original: string; suggested: string}>>([])
  const [itemDetailModal, setItemDetailModal] = useState<{type: 'weaknesses' | 'suggestions'; item: string | {text: string; quotes?: string[]}} | null>(null)
  // Re-analysis dialog — scegli se includere contesto precedente
  const [reanalysisDialog, setReanalysisDialog] = useState<{chapterId: string; label: string; provider: AIProvider} | null>(null)
  // Commento autore — dialog pre-analisi
  const [analyzeDialog, setAnalyzeDialog] = useState<{chapterId: string; provider: AIProvider} | null>(null)
  const [authorComment, setAuthorComment] = useState<string>('')
  // Commento nel dialog di rianalisi
  const [reanalysisComment, setReanalysisComment] = useState<string>('')
  // Storico analisi — ID capitolo espanso nella tabella confronto
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)
  // Cancellazione analisi — traccia quale provider è in corso di delete
  const [deletingAnalysis, setDeletingAnalysis] = useState<{chapterId: string; provider: AIProvider} | null>(null)
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
    if (chapters.length > 0) {
      void loadAllAnalyses()
      void loadAnalysisErrors()
    }
  }, [chapters, loadAllAnalyses, loadAnalysisErrors])

  // Reset editor + corrections when switching chapter
  useEffect(() => {
    if (selectedId) void loadAnalysis(selectedId)
    setAcceptedCorrections(new Set())
    setRejectedCorrections(new Set())
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
    const pending = pendingAnalysis
    setElapsedSeconds(Math.floor((Date.now() - new Date(pending.triggeredAt).getTime()) / 1000))
    const tickId = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - new Date(pending.triggeredAt).getTime()) / 1000))
    }, 1000)

    async function poll() {
      try {
        // Controlla lo stato del workflow GitHub (non tocca lo store)
        const run = await getLatestWorkflowRun(GITHUB_REPO_OWNER, GITHUB_REPO_NAME, 'ai-analysis.yml')
        if (run) setWorkflowRun(run)

        // ── Check silenzioso su Firestore — NESSUN re-render ──────────────
        // Legge direttamente il DB senza passare per lo store Zustand
        const [isDone, hasError] = await Promise.all([
          checkAnalysisAfter(pending.chapterId, pending.triggeredAt),
          checkErrorAfter(pending.chapterId, pending.triggeredAt),
        ])

        if (isDone) {
          // Solo qui aggiorniamo lo store → un unico re-render al completamento
          if (pending.chapterId === 'all') {
            await loadAllAnalyses()
          } else {
            await loadAnalysis(pending.chapterId)
          }
          await loadAnalysisErrors()
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

        if (hasError && run?.status === 'completed') {
          await loadAnalysisErrors()
          toast.error(`Analisi fallita per "${pending.chapterTitle}" — vedi dettagli errori`)
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
  }, [pendingAnalysis, loadAnalysis, loadAllAnalyses, loadAnalysisErrors])

  const selectedChapter = chapters.find((c) => c.id === selectedId) ?? null
  const chapterAnalyses = selectedId ? (analyses[selectedId] ?? null) : null
  const analysis = chapterAnalyses?.[activeProvider] ?? null
  const availableProviders = chapterAnalyses ? (Object.keys(chapterAnalyses) as AIProvider[]) : []
  const isDirty = editorContent !== (selectedChapter?.driveContent ?? '')
  const isPendingPush = isDirty || selectedChapter?.syncStatus === SyncStatus.PENDING_PUSH
  const isGoogleDoc = selectedChapter?.driveMimeType === 'application/vnd.google-apps.document'

  async function triggerAnalysis(chapterId: string, includePrevious = false, provider: AIProvider = activeProvider, comment?: string) {
    const hasExisting =
      chapterId === 'all'
        ? Object.keys(analyses).length > 0
        : !!analyses[chapterId]?.[provider]

    // Se non è ancora passato dal dialog di primo avvio, mostralo
    if (!hasExisting && !analyzeDialog && comment === undefined) {
      const saved = chapterId !== 'all' ? getAuthorComment(chapterId) : ''
      setAuthorComment(saved)
      setAnalyzeDialog({chapterId, provider})
      return
    }

    if (hasExisting && !reanalysisDialog && comment === undefined) {
      // Mostra il dialog per scegliere se includere il contesto precedente
      const existingAnalysis = chapterId !== 'all' ? analyses[chapterId]?.[provider] : null
      const label =
        chapterId === 'all'
          ? 'Alcuni capitoli hanno già un\'analisi salvata'
          : `Il capitolo ha già un'analisi ${AI_PROVIDER_CONFIG[provider].label} del ${formatRelativeDate(existingAnalysis!.analyzedAt)}`
      const saved = chapterId !== 'all' ? getAuthorComment(chapterId) : ''
      setReanalysisComment(saved)
      setReanalysisDialog({chapterId, label, provider})
      return
    }

    // Salva il commento per questo capitolo (se fornito e non "all")
    if (comment !== undefined && chapterId !== 'all') {
      saveAuthorComment(chapterId, comment)
    }

    setAnalyzeDialog(null)
    setReanalysisDialog(null)
    setTriggering(true)
    try {
      // Prima di avviare l'analisi, sincronizza il testo aggiornato da Drive
      if (chapterId !== 'all' && driveConfig && user) {
        const chapter = chapters.find((c) => c.id === chapterId)
        if (chapter?.driveFileId) {
          try {
            const {accessToken, updatedTokens} = await getValidAccessToken(driveConfig, user.uid)
            if (updatedTokens) await patchTokens(user.uid, updatedTokens)
            const rawContent = await getDriveFileContent(accessToken, chapter.driveFileId, chapter.driveMimeType ?? 'text/plain')
            const {body: bodyContent} = parseYamlFrontmatter(rawContent)
            await chaptersService.updateChapter(chapter.id, {
              driveContent: bodyContent,
              currentChars: bodyContent.length,
              wordCount: bodyContent.split(/\s+/).filter(Boolean).length,
              syncStatus: SyncStatus.SYNCED,
              syncSource: SyncSource.DRIVE,
              lastSyncAt: new Date().toISOString(),
            })
            await loadChapters()
            setEditorContent(bodyContent)
            toast.info('Testo aggiornato da Drive prima dell\'analisi')
          } catch {
            // Non bloccante: si procede con la versione in Firestore
            toast.warning('Impossibile sincronizzare da Drive — verrà usata la versione locale')
          }
        }
      }

      const workflowInputs: Record<string, string> = {
        chapter_id: chapterId,
        include_previous: includePrevious ? 'true' : 'false',
        ai_provider: provider,
      }
      // Aggiungi il commento autore se presente (non vuoto)
      const effectiveComment = comment ?? (chapterId !== 'all' ? getAuthorComment(chapterId) : '')
      if (effectiveComment.trim()) {
        workflowInputs.author_comment = effectiveComment.trim()
      }

      await triggerWorkflow(GITHUB_REPO_OWNER, GITHUB_REPO_NAME, 'ai-analysis.yml', workflowInputs)
      const chapterTitle =
        chapterId === 'all'
          ? 'tutti i capitoli'
          : (chapters.find((c) => c.id === chapterId)?.title ?? chapterId)
      const pending: PendingAnalysis = {chapterId, chapterTitle, triggeredAt: new Date().toISOString()}
      savePending(pending)
      setPendingAnalysis(pending)
      setElapsedSeconds(0)
      toast.success(`Analisi ${AI_PROVIDER_CONFIG[provider].label} avviata per "${chapterTitle}"${includePrevious ? ' (con contesto precedente)' : ''}! Monitoraggio attivato.`)
    } catch (err) {
      toast.error('Errore: ' + (err as Error).message)
    } finally {
      setTriggering(false)
    }
  }

  async function handleApplyCorrections() {
    if (!selectedChapter || !analysis || acceptedCorrections.size === 0) return
    setIsApplying(true)
    isApplyingRef.current = true
    try {
      const baseContent = selectedChapter.driveContent ?? ''
      const { content, applied, notFound } = applyCorrectionsToContent(
        baseContent,
        analysis.corrections,
        acceptedCorrections,
      )
      const accepted = Array.from(acceptedCorrections)
      const rejected = Array.from(rejectedCorrections)

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
        }, activeProvider),
      ])
      await Promise.all([loadChapters(), loadAnalysis(selectedId)])

      // Salva le modifiche per mostrarle nell'editor
      const changes = accepted
        .map((i) => analysis.corrections[i])
        .filter((c) => !!c && baseContent.includes(c.original))
        .map((c) => ({original: c!.original, suggested: c!.suggested}))
      setAppliedChanges(changes)
      setEditorContent(content)
      setAcceptedCorrections(new Set())
      setRejectedCorrections(new Set())

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
      const {accessToken, updatedTokens} = await getValidAccessToken(driveConfig, user.uid)
      if (updatedTokens) await patchTokens(user.uid, updatedTokens)

      if (isGoogleDoc && selectedChapter.driveFileId) {
        // Google Doc: usa Google Docs API replaceAllText per preservare font/grassetti/spaziatura
        let replacements: Array<{original: string; suggested: string}>
        let analysisUpdate: Parameters<typeof patchAnalysis>[1] | null = null

        if (appliedChanges.length > 0) {
          // Flusso 2-step: l'utente ha già cliccato "Applica N correzioni"
          replacements = appliedChanges
        } else if (acceptedCorrections.size > 0 && analysis?.corrections) {
          // Flusso diretto: l'utente ha accettato correzioni e salva senza passare per "Applica"
          replacements = Array.from(acceptedCorrections)
            .map((i) => analysis!.corrections[i])
            .filter(Boolean)
            .map((c) => ({original: c.original, suggested: c.suggested}))
          // Salviamo anche lo stato delle correzioni sull'analisi
          analysisUpdate = {
            acceptedCorrections: Array.from(acceptedCorrections),
            rejectedCorrections: Array.from(rejectedCorrections),
            appliedAt: new Date().toISOString(),
          }
        } else {
          // Nessuna correzione selezionata: salva il contenuto dell'editor così com'è
          replacements = [{original: selectedChapter.driveContent ?? '', suggested: editorContent}]
        }

        const filtered = replacements.filter(
          ({original, suggested}) => original && original !== suggested,
        )
        const {applied} = await applyTextReplacements(accessToken, selectedChapter.driveFileId, filtered)

        const newContent = (() => {
          if (appliedChanges.length > 0) return editorContent
          if (acceptedCorrections.size > 0 && analysis?.corrections) {
            // Applica le stesse sostituzioni al driveContent locale per tenerlo in sync
            let content = selectedChapter.driveContent ?? ''
            for (const {original, suggested} of filtered) {
              content = content.replace(original, suggested)
            }
            return content
          }
          return editorContent
        })()

        await Promise.all([
          chaptersService.updateChapter(selectedChapter.id, {
            driveContent: newContent,
            currentChars: newContent.length,
            wordCount: newContent.split(/\s+/).filter(Boolean).length,
            syncStatus: SyncStatus.SYNCED,
            syncSource: SyncSource.DASHBOARD,
            lastSyncAt: new Date().toISOString(),
          }),
          ...(analysisUpdate ? [patchAnalysis(selectedChapter.id, analysisUpdate, activeProvider)] : []),
        ])
        await loadChapters()
        if (applied === 0 && filtered.length === 0 && acceptedCorrections.size === 0) {
          toast.info('Nessuna modifica da inviare al Doc')
        } else if (applied === 0 && filtered.length > 0) {
          toast.warning(`Testo non trovato nel Doc per ${filtered.length} correzioni — verifica che il contenuto sia sincronizzato`)
        } else {
          toast.success(`${applied} sostituzion${applied === 1 ? 'e' : 'i'} applicat${applied === 1 ? 'a' : 'e'} nel Doc — font e formattazione preservati`)
        }
        setAcceptedCorrections(new Set())
        setRejectedCorrections(new Set())
        setAppliedChanges([])
      } else {
        // File markdown: upload completo
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
      }
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('403') || msg.includes('insufficient')) {
        toast.error('Permesso negato — disconnetti e riconnetti Drive per aggiornare le autorizzazioni')
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

  function toggleAccept(idx: number) {
    setAcceptedCorrections((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
    setRejectedCorrections((prev) => {
      if (!prev.has(idx)) return prev
      const next = new Set(prev)
      next.delete(idx)
      return next
    })
  }

  function toggleReject(idx: number) {
    setRejectedCorrections((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
    setAcceptedCorrections((prev) => {
      if (!prev.has(idx)) return prev
      const next = new Set(prev)
      next.delete(idx)
      return next
    })
  }

  function selectAllCorrections() {
    if (!analysis) return
    setAcceptedCorrections(new Set(analysis.corrections.map((_, i) => i)))
    setRejectedCorrections(new Set())
  }

  function deselectAllCorrections() {
    setAcceptedCorrections(new Set())
    setRejectedCorrections(new Set())
  }

  // Chapters with analysis sorted by overall score desc
  const analyzedChapters = [...chapters]
    .filter((c) => analyses[c.id] && Object.keys(analyses[c.id]).length > 0)
    .sort((a, b) => {
      const aScore = analyses[b.id]?.[activeProvider]?.scores.overall ?? Object.values(analyses[b.id] ?? {})[0]?.scores.overall ?? 0
      const bScore = analyses[a.id]?.[activeProvider]?.scores.overall ?? Object.values(analyses[a.id] ?? {})[0]?.scores.overall ?? 0
      return aScore - bScore
    })

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
    ...(settings.bookType === 'storico' || analysis?.historicalAccuracy
      ? [{id: 'storico' as Tab, label: 'Accuratezza Storica'}]
      : []),
    ...(analysis?.readerReactions?.length
      ? [{id: 'reazioni' as Tab, label: 'Reazioni Lettori', count: analysis.readerReactions.length}]
      : []),
    {id: 'editor', label: 'Editor'},
  ]

  return (
    <div className="space-y-6 p-6">

      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Analisi AI</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Feedback generato da AI · {analyzedChapters.length}/{chapters.length} capitoli analizzati
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
              {String(c.number).padStart(2, '0')} — {c.title}{c.status === 'DONE' ? ' ✅' : analyses[c.id] && Object.keys(analyses[c.id]).length > 0 ? ' ✓' : ''}
            </option>
          ))}
        </select>

        {/* AI Provider selector */}
        <select
          value={activeProvider}
          onChange={(e) => {
            setActiveProvider(e.target.value as AIProvider)
            setAcceptedCorrections(new Set())
            setRejectedCorrections(new Set())
            setAppliedChanges([])
          }}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-2 text-sm text-slate-300 outline-none focus:border-violet-500/40"
          title="AI per analisi"
        >
          {Object.entries(AI_PROVIDER_CONFIG).map(([val, cfg]) => (
            <option key={val} value={val}>{cfg.icon} {cfg.label}</option>
          ))}
        </select>

        {/* Trigger chapter */}
        <button
          onClick={() => selectedId && void triggerAnalysis(selectedId)}
          disabled={!selectedId || triggering || pendingAnalysis?.chapterId === selectedId}
          title={pendingAnalysis?.chapterId === selectedId ? 'Analisi già in corso per questo capitolo' : `Analizza con ${AI_PROVIDER_CONFIG[activeProvider].label}`}
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
            {isLoading && !analysis && (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
              </div>
            )}
            {!isLoading && analysis && (
              <>
                {/* Done banner — chiaro segnale che il capitolo è chiuso */}
                {selectedChapter?.status === 'DONE' && (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-700/40 bg-emerald-900/20 px-4 py-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-emerald-300">
                        Capitolo completato
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Questo capitolo è stato segnato come &quot;Done&quot; nella Kanban board. L&apos;analisi sottostante si riferisce all&apos;ultima versione analizzata. Puoi riaprirlo dalla board se vuoi rivederlo.
                      </p>
                    </div>
                  </div>
                )}

                {/* Provider tabs — switch tra analisi di diverse AI */}
                {availableProviders.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-600">Analisi di:</span>
                    <div className="flex rounded-lg border border-[var(--border)] p-0.5">
                      {Object.entries(AI_PROVIDER_CONFIG).map(([key, cfg]) => {
                        const provider = key as AIProvider
                        const hasAnalysis = availableProviders.includes(provider)
                        const isActive = activeProvider === provider
                        return (
                          <button
                            key={key}
                            onClick={() => {
                              setActiveProvider(provider)
                              setAcceptedCorrections(new Set())
                              setRejectedCorrections(new Set())
                              setAppliedChanges([])
                            }}
                            disabled={!hasAnalysis}
                            className={cn(
                              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                              isActive && hasAnalysis
                                ? 'bg-[var(--overlay)] text-[var(--text-primary)]'
                                : hasAnalysis
                                  ? 'text-slate-500 hover:text-slate-300'
                                  : 'text-slate-700 cursor-not-allowed'
                            )}
                          >
                            <span className={cn('h-1.5 w-1.5 rounded-full', hasAnalysis ? cfg.dot : 'bg-slate-700')} />
                            {cfg.label}
                            {hasAnalysis && chapterAnalyses?.[provider] && (
                              <span className="text-slate-600 ml-0.5">
                                ({new Date(chapterAnalyses[provider].analyzedAt).toLocaleDateString('it-IT', {day: '2-digit', month: '2-digit'})}
                                {' '}{new Date(chapterAnalyses[provider].analyzedAt).toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})})
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Errori analisi per questo capitolo */}
                {(() => {
                  const chErrors = analysisErrors.filter((e) => e.chapterId === selectedId)
                  if (chErrors.length === 0) return null
                  return (
                    <div className="space-y-2">
                      {chErrors.map((err) => (
                        <div
                          key={`${err.chapterId}-${err.provider}`}
                          className="flex items-start gap-3 rounded-xl border border-red-800/40 bg-red-900/15 px-4 py-3"
                        >
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-red-300">
                              Analisi {AI_PROVIDER_CONFIG[err.provider as AIProvider]?.label ?? err.provider} fallita
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {err.error}
                            </p>
                            <p className="mt-1 text-xs text-slate-700">
                              {new Date(err.failedAt).toLocaleString('it-IT')} · modello: {err.model}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}

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
                      {formatRelativeDate(analysis.analyzedAt)}{' '}
                      ({new Date(analysis.analyzedAt).toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})})
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
                      {/* Commento autore inviato prima dell'analisi */}
                      {analysis.authorComment && (
                        <div className="mt-4 rounded-lg border border-violet-800/30 bg-violet-900/10 px-3 py-2.5">
                          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-violet-400">
                            <FileEdit className="h-3 w-3" />
                            Nota autore
                          </p>
                          <p className="text-xs italic leading-relaxed text-slate-400">&ldquo;{analysis.authorComment}&rdquo;</p>
                        </div>
                      )}
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
                            const itemText = typeof item === 'string' ? item : item.text
                            const itemQuotes = typeof item === 'string' ? [] : (item.quotes ?? [])
                            return (
                              <li
                                key={i}
                                onClick={isClickable ? () => setItemDetailModal({type: activeTab as 'weaknesses' | 'suggestions', item}) : undefined}
                                className={cn(
                                  'flex items-start gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-3 py-2.5 text-sm',
                                  isClickable && 'cursor-pointer transition-colors hover:border-[var(--border-strong)] hover:bg-white/[0.07]'
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
                                <div className="flex-1 min-w-0">
                                  <span className="text-[var(--text-primary)]">{itemText}</span>
                                  {itemQuotes.length > 0 && (
                                    <p className="mt-1.5 truncate text-xs italic text-slate-500">
                                      &ldquo;{itemQuotes[0]}&rdquo;{itemQuotes.length > 1 && ` (+${itemQuotes.length - 1})`}
                                    </p>
                                  )}
                                </div>
                                {isClickable && (
                                  <span className="shrink-0 text-xs text-slate-500 mt-0.5">dettagli →</span>
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
                                    Correzioni revisionate il {new Date(analysis.appliedAt).toLocaleDateString('it-IT')}
                                    {' '}· {analysis.acceptedCorrections?.length ?? 0} accettate
                                    {analysis.rejectedCorrections && analysis.rejectedCorrections.length > 0 && (
                                      <>, {analysis.rejectedCorrections.length} rifiutate</>
                                    )}
                                    {(() => {
                                      const pending = analysis.corrections.length
                                        - (analysis.acceptedCorrections?.length ?? 0)
                                        - (analysis.rejectedCorrections?.length ?? 0)
                                      return pending > 0 ? <>, {pending} da rivedere</> : null
                                    })()}
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
                                  Accetta tutte
                                </button>
                                <button
                                  onClick={deselectAllCorrections}
                                  className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-slate-400 transition-colors hover:bg-[var(--overlay)] hover:text-slate-200"
                                >
                                  <Square className="h-3 w-3" />
                                  Resetta tutte
                                </button>
                                {(acceptedCorrections.size > 0 || rejectedCorrections.size > 0) && (
                                  <span className="text-xs text-slate-500">
                                    {acceptedCorrections.size > 0 && (
                                      <span className="text-emerald-500">{acceptedCorrections.size} ✓</span>
                                    )}
                                    {acceptedCorrections.size > 0 && rejectedCorrections.size > 0 && <span className="mx-1 text-slate-700">·</span>}
                                    {rejectedCorrections.size > 0 && (
                                      <span className="text-red-400">{rejectedCorrections.size} ✗</span>
                                    )}
                                    {(() => {
                                      const pending = analysis!.corrections.length - acceptedCorrections.size - rejectedCorrections.size
                                      return pending > 0 ? <span className="text-slate-600 ml-1">· {pending} da rivedere</span> : null
                                    })()}
                                  </span>
                                )}
                                <div className="flex-1" />
                                <button
                                  onClick={() => void handleApplyCorrections()}
                                  disabled={
                                    acceptedCorrections.size === 0 ||
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
                                  Applica {acceptedCorrections.size > 0 ? acceptedCorrections.size : ''} correzioni
                                </button>
                              </div>

                              {/* Correction list */}
                              {analysis.corrections.map((c, i) => {
                                const isAccepted = acceptedCorrections.has(i)
                                const isRejected = rejectedCorrections.has(i)
                                const wasAccepted = analysis.acceptedCorrections?.includes(i)
                                const wasRejected = analysis.rejectedCorrections?.includes(i)
                                return (
                                  <div
                                    key={i}
                                    onClick={() => toggleAccept(i)}
                                    className={cn(
                                      'cursor-pointer rounded-lg border p-4 space-y-3 transition-colors',
                                      isAccepted
                                        ? 'border-emerald-600/50 bg-emerald-900/15'
                                        : isRejected
                                          ? 'border-red-800/40 bg-red-950/10 opacity-60'
                                          : wasAccepted
                                            ? 'border-emerald-700/30 bg-emerald-900/10'
                                            : wasRejected
                                              ? 'border-slate-700/40 bg-slate-900/20 opacity-50'
                                              : 'border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--overlay)]'
                                    )}
                                  >
                                    <div className="flex items-center gap-2">
                                      {/* Accetta checkbox */}
                                      <div
                                        onClick={(e) => { e.stopPropagation(); toggleAccept(i) }}
                                        className={cn(
                                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                                          isAccepted
                                            ? 'border-emerald-500 bg-emerald-600'
                                            : 'border-[var(--border-strong)] bg-transparent hover:border-emerald-600'
                                        )}
                                      >
                                        {isAccepted && <CheckCheck className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                                      </div>
                                      {/* Rifiuta button */}
                                      <div
                                        onClick={(e) => { e.stopPropagation(); toggleReject(i) }}
                                        title={isRejected ? 'Annulla rifiuto' : 'Rifiuta correzione'}
                                        className={cn(
                                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                                          isRejected
                                            ? 'border-red-500 bg-red-600'
                                            : 'border-[var(--border-strong)] bg-transparent hover:border-red-600'
                                        )}
                                      >
                                        {isRejected && <X className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                                      </div>
                                      <span
                                        className={cn(
                                          'inline-flex rounded-full border px-2 py-0.5 text-xs',
                                          CORRECTION_TYPE_COLORS[c.type] ?? 'border-[var(--border)] bg-[var(--overlay)] text-slate-400'
                                        )}
                                      >
                                        {CORRECTION_TYPE_LABELS[c.type] ?? c.type}
                                      </span>
                                      {/* Stato sessione corrente */}
                                      {isAccepted && (
                                        <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-900/40 border border-emerald-700/50 px-2 py-0.5 text-xs font-medium text-emerald-400">
                                          <CheckCheck className="h-3 w-3" />
                                          da applicare
                                        </span>
                                      )}
                                      {isRejected && (
                                        <span className="ml-auto flex items-center gap-1 rounded-full bg-red-900/30 border border-red-800/40 px-2 py-0.5 text-xs text-red-400">
                                          <X className="h-3 w-3" />
                                          rifiutata
                                        </span>
                                      )}
                                      {!isAccepted && !isRejected && (
                                        <span className="ml-auto text-xs text-slate-700 italic">da rivedere</span>
                                      )}
                                      {/* Badge storico (dopo apply precedente) */}
                                      {!isAccepted && !isRejected && wasAccepted && (
                                        <span className="flex items-center gap-1 rounded-full bg-emerald-900/30 border border-emerald-800/30 px-2 py-0.5 text-xs text-emerald-600">
                                          <CheckCheck className="h-3 w-3" />
                                          già accettata
                                        </span>
                                      )}
                                      {!isAccepted && !isRejected && wasRejected && (
                                        <span className="flex items-center gap-1 rounded-full bg-slate-800/40 border border-slate-700/30 px-2 py-0.5 text-xs text-slate-600">
                                          <X className="h-3 w-3" />
                                          già rifiutata
                                        </span>
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
                      ) : activeTab === 'storico' ? (
                        <motion.div
                          key="storico"
                          initial={{opacity: 0, x: -4}}
                          animate={{opacity: 1, x: 0}}
                          exit={{opacity: 0}}
                          transition={{duration: 0.15}}
                          className="space-y-4"
                        >
                          {analysis.historicalAccuracy ? (
                            <>
                              {/* Score e sintesi */}
                              <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--overlay)] p-4">
                                <div className="flex flex-col items-center gap-1">
                                  <span className={cn(
                                    'text-3xl font-bold tabular-nums',
                                    analysis.historicalAccuracy.score >= 8 ? 'text-emerald-400' :
                                    analysis.historicalAccuracy.score >= 6 ? 'text-blue-400' :
                                    analysis.historicalAccuracy.score >= 4 ? 'text-amber-400' : 'text-red-400'
                                  )}>
                                    {analysis.historicalAccuracy.score.toFixed(1)}
                                  </span>
                                  <span className="text-xs text-slate-600">/10</span>
                                </div>
                                <p className="flex-1 text-sm leading-relaxed text-slate-300">
                                  {analysis.historicalAccuracy.summary}
                                </p>
                              </div>

                              {/* Elementi corretti */}
                              {analysis.historicalAccuracy.correct.length > 0 && (
                                <div>
                                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-500">
                                    Accurato ({analysis.historicalAccuracy.correct.length})
                                  </p>
                                  <ul className="space-y-1.5">
                                    {analysis.historicalAccuracy.correct.map((item, i) => (
                                      <li key={i} className="flex items-start gap-2.5 text-sm">
                                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                                        <span className="text-slate-300">{item}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Anacronismi */}
                              {analysis.historicalAccuracy.anachronisms.length > 0 && (
                                <div>
                                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-500">
                                    Anacronismi ({analysis.historicalAccuracy.anachronisms.length})
                                  </p>
                                  <ul className="space-y-1.5">
                                    {analysis.historicalAccuracy.anachronisms.map((item, i) => (
                                      <li key={i} className="flex items-start gap-2.5 text-sm">
                                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                                        <span className="text-slate-300">{item}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Problemi specifici */}
                              {analysis.historicalAccuracy.issues.length > 0 && (
                                <div>
                                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-400">
                                    Problemi da correggere ({analysis.historicalAccuracy.issues.length})
                                  </p>
                                  <div className="space-y-3">
                                    {analysis.historicalAccuracy.issues.map((issue, i) => (
                                      <div key={i} className="rounded-xl border border-red-800/30 bg-red-900/10 p-4 space-y-2">
                                        <p className="rounded-lg bg-[var(--overlay)] px-3 py-2 text-xs text-slate-400 italic">
                                          "{issue.quote}"
                                        </p>
                                        <p className="text-sm text-red-300">{issue.issue}</p>
                                        <p className="flex items-start gap-1.5 text-xs text-slate-500">
                                          <span className="shrink-0 font-medium text-blue-400">Suggerimento:</span>
                                          {issue.suggestion}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="rounded-xl border border-dashed border-[var(--border)] py-10 text-center">
                              <p className="text-sm text-slate-500">
                                Dati sull'accuratezza storica non disponibili.
                              </p>
                              <p className="mt-1 text-xs text-slate-600">
                                Rianalizza il capitolo per ottenere questa sezione.
                              </p>
                            </div>
                          )}
                        </motion.div>
                      ) : activeTab === 'reazioni' ? (
                        <motion.div
                          key="reazioni"
                          initial={{opacity: 0, x: -4}}
                          animate={{opacity: 1, x: 0}}
                          exit={{opacity: 0}}
                          transition={{duration: 0.15}}
                          className="space-y-3"
                        >
                          {analysis.readerReactions && analysis.readerReactions.length > 0 ? (
                            analysis.readerReactions.map((r, i) => (
                              <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--overlay)] p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xl">{r.emoji}</span>
                                    <span className="text-sm font-medium text-slate-300">{r.persona}</span>
                                  </div>
                                  <div className="flex gap-0.5">
                                    {Array.from({length: 5}).map((_, star) => (
                                      <span key={star} className={star < r.rating ? 'text-amber-400' : 'text-slate-700'}>★</span>
                                    ))}
                                  </div>
                                </div>
                                <p className="text-sm italic text-slate-300">"{r.reaction}"</p>
                                <p className="text-sm leading-relaxed text-slate-400">{r.comment}</p>
                                {r.questions.length > 0 && (
                                  <div className="rounded-lg border border-blue-800/30 bg-blue-900/10 p-3">
                                    <p className="mb-2 text-xs font-semibold text-blue-400">Domande che si farebbe:</p>
                                    <ul className="space-y-1">
                                      {r.questions.map((q, qi) => (
                                        <li key={qi} className="flex items-start gap-2 text-xs text-slate-400">
                                          <span className="shrink-0 text-blue-600">?</span>
                                          {q}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="rounded-xl border border-dashed border-[var(--border)] py-10 text-center">
                              <p className="text-sm text-slate-500">
                                Reazioni dei lettori non disponibili.
                              </p>
                              <p className="mt-1 text-xs text-slate-600">
                                Rianalizza il capitolo per ottenere questa sezione.
                              </p>
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
                              {driveConfig?.folderId && (
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
            )}
            {!isLoading && !analysis && availableProviders.length > 0 && (
              /* Has analyses from other providers but not the active one */
              <div className="space-y-4">
                <div className="rounded-xl border border-dashed border-[var(--border)] py-12 text-center">
                  <RadarIcon className="mx-auto mb-3 h-10 w-10 text-slate-700" />
                  <p className="text-sm font-medium text-slate-400">
                    Nessuna analisi {AI_PROVIDER_CONFIG[activeProvider].label} per questo capitolo
                  </p>
                  <p className="mt-1 text-xs text-slate-600 mb-4">
                    {'Analisi disponibili: '}{availableProviders.map((p) => AI_PROVIDER_CONFIG[p].label).join(', ')}
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => setActiveProvider(availableProviders[0])}
                      className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-[var(--overlay)]"
                    >
                      {'Vedi analisi '}{AI_PROVIDER_CONFIG[availableProviders[0]].label}
                    </button>
                    <button
                      onClick={() => void triggerAnalysis(selectedId)}
                      disabled={triggering}
                      className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
                    >
                      {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      {'Analizza con '}{AI_PROVIDER_CONFIG[activeProvider].label}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {!isLoading && !analysis && availableProviders.length === 0 && (
              /* No analysis at all */
              <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
                <RadarIcon className="mx-auto mb-3 h-10 w-10 text-slate-700" />
                <p className="text-sm font-medium text-slate-400">Nessuna analisi disponibile</p>
                <p className="mt-1 text-xs text-slate-600 mb-5">
                  {'Avvia l\'analisi '}{AI_PROVIDER_CONFIG[activeProvider].label}{' per questo capitolo'}
                </p>
                <button
                  onClick={() => void triggerAnalysis(selectedId)}
                  disabled={triggering}
                  className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
                >
                  {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {'Avvia analisi '}{AI_PROVIDER_CONFIG[activeProvider].label}
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
            item={itemDetailModal.item}
            chapterContent={selectedChapter?.driveContent ?? ''}
            onClose={() => setItemDetailModal(null)}
          />
        )}
      </AnimatePresence>

      {/* Errori analisi recenti */}
      {analysisErrors.length > 0 && (
        <motion.div
          initial={{opacity: 0, y: 8}}
          animate={{opacity: 1, y: 0}}
          className="rounded-xl border border-red-800/30 bg-red-900/10"
        >
          <div className="border-b border-red-800/20 px-5 py-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-red-400">
              Analisi fallite — {analysisErrors.length} errori recenti
            </h2>
          </div>
          <div className="divide-y divide-red-800/10">
            {analysisErrors.map((err) => {
              const ch = chapters.find((c) => c.id === err.chapterId)
              return (
                <div key={`${err.chapterId}-${err.provider}`} className="flex items-start gap-3 px-5 py-3">
                  <span className={cn('mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full', AI_PROVIDER_CONFIG[err.provider as AIProvider]?.dot ?? 'bg-slate-600')} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-300">
                      <span className="font-medium">{ch ? `${String(ch.number).padStart(2, '0')} — ${ch.title}` : err.chapterId}</span>
                      {' · '}
                      <span className={AI_PROVIDER_CONFIG[err.provider as AIProvider]?.color ?? 'text-slate-500'}>
                        {AI_PROVIDER_CONFIG[err.provider as AIProvider]?.label ?? err.provider}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 truncate">{err.error}</p>
                    <p className="mt-0.5 text-xs text-slate-700">
                      {new Date(err.failedAt).toLocaleString('it-IT')} · {err.model}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* Comparison table — multi-provider */}
      {analyzedChapters.length > 0 && (() => {
        // Calcola quali provider hanno almeno un'analisi
        const allProviders = Object.keys(AI_PROVIDER_CONFIG) as AIProvider[]
        const usedProviders = allProviders.filter((p) =>
          analyzedChapters.some((c) => !!analyses[c.id]?.[p]),
        )
        return (
          <motion.div
            initial={{opacity: 0, y: 8}}
            animate={{opacity: 1, y: 0}}
            transition={{delay: 0.1}}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]"
          >
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Confronto capitoli — {analyzedChapters.length} analizzati · {usedProviders.length} provider
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
                    {/* Overall per provider */}
                    {usedProviders.map((p) => (
                      <th key={p} className="px-3 py-2.5 text-center font-medium">
                        <span className={cn('inline-flex items-center gap-1', AI_PROVIDER_CONFIG[p].color)}>
                          <span className={cn('inline-block h-1.5 w-1.5 rounded-full', AI_PROVIDER_CONFIG[p].dot)} />
                          {AI_PROVIDER_CONFIG[p].label}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analyzedChapters.map((c) => {
                    const byProvider = analyses[c.id]
                    const displayAnalysis = byProvider?.[activeProvider] ?? Object.values(byProvider ?? {})[0]
                    if (!displayAnalysis) return null
                    const isExpanded = expandedHistoryId === c.id
                    const chapterHistory = analysisHistory[c.id]
                    return (
                      <React.Fragment key={c.id}>
                        <tr
                          onClick={() => {
                            if (isExpanded) {
                              setExpandedHistoryId(null)
                            } else {
                              setExpandedHistoryId(c.id)
                              if (!analysisHistory[c.id]) void loadChapterHistory(c.id)
                            }
                          }}
                          className={cn(
                            'cursor-pointer border-b border-[var(--border)] transition-colors hover:bg-[var(--overlay)]',
                            selectedId === c.id && 'bg-violet-900/10',
                          )}
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <ChevronDown className={cn('h-3.5 w-3.5 text-slate-600 transition-transform', isExpanded && 'rotate-180')} />
                              <span className="mr-1 text-xs text-slate-600">
                                {String(c.number).padStart(2, '0')}
                              </span>
                              <span className="text-slate-300">{c.title}</span>
                            </div>
                          </td>
                          {Object.keys(SCORE_LABELS).map((key) => {
                            const val = displayAnalysis.scores[key as keyof typeof displayAnalysis.scores] as number
                            return (
                              <td key={key} className={cn('px-3 py-3 text-center text-xs font-medium', getScoreColor(val))}>
                                {val.toFixed(1)}
                              </td>
                            )
                          })}
                          {usedProviders.map((p) => {
                            const a = byProvider?.[p]
                            if (!a) return (
                              <td key={p} className="px-3 py-3 text-center text-xs text-slate-700">—</td>
                            )
                            return (
                              <td key={p} className="px-3 py-3 text-center">
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className={cn('text-sm font-bold', getScoreColor(a.scores.overall))}>
                                    {a.scores.overall.toFixed(1)}
                                  </span>
                                  <span className="text-[10px] text-slate-600">
                                    {new Date(a.analyzedAt).toLocaleDateString('it-IT', {day: '2-digit', month: '2-digit', year: '2-digit'})}
                                    {' '}
                                    {new Date(a.analyzedAt).toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setDeletingAnalysis({chapterId: c.id, provider: p})
                                    }}
                                    title={`Elimina analisi ${AI_PROVIDER_CONFIG[p].label}`}
                                    className="mt-0.5 rounded p-0.5 text-slate-700 transition-colors hover:text-red-400"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                        {/* Expanded history panel */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={Object.keys(SCORE_LABELS).length + 1 + usedProviders.length} className="px-5 py-4 bg-[var(--overlay)]">
                              {!chapterHistory ? (
                                <div className="flex items-center gap-2 py-4 justify-center">
                                  <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                                  <span className="text-xs text-slate-500">Caricamento storico…</span>
                                </div>
                              ) : (() => {
                                const providerEntries = Object.entries(chapterHistory) as [AIProvider, import('@/types').ChapterAnalysis[]][]
                                const hasHistory = providerEntries.some(([, list]) => list.length > 1)
                                if (!hasHistory) {
                                  return (
                                    <div className="py-4 text-center">
                                      <History className="mx-auto mb-2 h-6 w-6 text-slate-700" />
                                      <p className="text-xs text-slate-500">Solo un'analisi disponibile — avvia un'altra analisi per vedere il trend.</p>
                                    </div>
                                  )
                                }
                                return (
                                  <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                      <TrendingUp className="h-4 w-4 text-violet-400" />
                                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                        Andamento score nel tempo
                                      </h3>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setSelectedId(c.id)
                                          setActiveTab('strengths')
                                          window.scrollTo({top: 0, behavior: 'smooth'})
                                        }}
                                        className="ml-auto text-xs text-violet-400 hover:text-violet-300"
                                      >
                                        Vai all'analisi ↑
                                      </button>
                                    </div>
                                    {providerEntries.map(([provider, historyList]) => {
                                      if (historyList.length < 2) return null
                                      const cfg = AI_PROVIDER_CONFIG[provider]
                                      return (
                                        <div key={provider} className="space-y-2">
                                          <div className="flex items-center gap-2">
                                            <span className={cn('h-2 w-2 rounded-full', cfg.dot)} />
                                            <span className={cn('text-xs font-medium', cfg.color)}>{cfg.label}</span>
                                            <span className="text-xs text-slate-600">
                                              ({historyList.length} analisi)
                                            </span>
                                          </div>
                                          {/* Score trend table */}
                                          <div className="overflow-x-auto">
                                            <table className="w-full text-xs">
                                              <thead>
                                                <tr className="text-slate-600">
                                                  <th className="px-2 py-1.5 text-left font-medium">Data</th>
                                                  <th className="px-2 py-1.5 text-left font-medium">Modello</th>
                                                  {Object.values(SCORE_LABELS).map((l) => (
                                                    <th key={l} className="px-2 py-1.5 text-center font-medium">{l}</th>
                                                  ))}
                                                  <th className="px-2 py-1.5 text-center font-medium">Overall</th>
                                                  <th className="px-2 py-1.5 text-center font-medium"></th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {historyList.map((entry, idx) => {
                                                  const prevEntry = idx > 0 ? historyList[idx - 1] : null
                                                  const overallDelta = prevEntry ? entry.scores.overall - prevEntry.scores.overall : 0
                                                  const entryWithId = entry as typeof entry & {_docId?: string}
                                                  return (
                                                    <tr key={idx} className="border-t border-[var(--border)]">
                                                      <td className="px-2 py-1.5 text-slate-400 whitespace-nowrap">
                                                        {new Date(entry.analyzedAt).toLocaleDateString('it-IT', {day: '2-digit', month: '2-digit', year: '2-digit'})}
                                                        {' '}
                                                        <span className="text-slate-600">{new Date(entry.analyzedAt).toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})}</span>
                                                      </td>
                                                      <td className="px-2 py-1.5 text-slate-600">{entry.model}</td>
                                                      {Object.keys(SCORE_LABELS).map((key) => {
                                                        const val = entry.scores[key as keyof typeof entry.scores] as number
                                                        const prevVal = prevEntry ? prevEntry.scores[key as keyof typeof prevEntry.scores] as number : null
                                                        const delta = prevVal !== null ? val - prevVal : 0
                                                        return (
                                                          <td key={key} className="px-2 py-1.5 text-center">
                                                            <span className={getScoreColor(val)}>{val.toFixed(1)}</span>
                                                            {delta !== 0 && (
                                                              <span className={cn('ml-1 text-[10px]', delta > 0 ? 'text-emerald-500' : 'text-red-400')}>
                                                                {delta > 0 ? '↑' : '↓'}{Math.abs(delta).toFixed(1)}
                                                              </span>
                                                            )}
                                                          </td>
                                                        )
                                                      })}
                                                      <td className="px-2 py-1.5 text-center">
                                                        <span className={cn('font-bold', getScoreColor(entry.scores.overall))}>
                                                          {entry.scores.overall.toFixed(1)}
                                                        </span>
                                                        {overallDelta !== 0 && (
                                                          <span className={cn('ml-1 text-[10px] font-medium', overallDelta > 0 ? 'text-emerald-500' : 'text-red-400')}>
                                                            {overallDelta > 0 ? '↑' : '↓'}{Math.abs(overallDelta).toFixed(1)}
                                                          </span>
                                                        )}
                                                      </td>
                                                      <td className="px-2 py-1.5 text-center">
                                                        {entryWithId._docId && (
                                                          <button
                                                            onClick={(e) => {
                                                              e.stopPropagation()
                                                              void deleteHistoryEntry(c.id, provider, entryWithId._docId!)
                                                            }}
                                                            title="Elimina questa analisi"
                                                            className="rounded p-0.5 text-slate-700 transition-colors hover:text-red-400"
                                                          >
                                                            <Trash2 className="h-3 w-3" />
                                                          </button>
                                                        )}
                                                      </td>
                                                    </tr>
                                                  )
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                          {/* Visual trend bar */}
                                          <div className="flex items-end gap-1 h-12">
                                            {historyList.map((entry, idx) => {
                                              const pct = (entry.scores.overall / 10) * 100
                                              return (
                                                <div
                                                  key={idx}
                                                  title={`${new Date(entry.analyzedAt).toLocaleDateString('it-IT')} ${new Date(entry.analyzedAt).toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})}: ${entry.scores.overall.toFixed(1)}/10`}
                                                  className="flex-1 rounded-t-sm transition-all"
                                                  style={{
                                                    height: `${pct}%`,
                                                    background: pct >= 80 ? '#10B981' : pct >= 60 ? '#7C3AED' : pct >= 40 ? '#F59E0B' : '#EF4444',
                                                    opacity: 0.3 + (idx / historyList.length) * 0.7,
                                                  }}
                                                />
                                              )
                                            })}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )
                              })()}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )
      })()}

      {/* Empty state */}
      {chapters.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
          <Sparkles className="mx-auto mb-3 h-10 w-10 text-slate-700" />
          <p className="text-sm font-medium text-slate-400">Nessun capitolo trovato</p>
          <p className="mt-1 text-xs text-slate-600">Vai al Kanban per aggiungere capitoli</p>
        </div>
      )}

      {/* Re-analysis dialog — scelta tra analisi da zero o con contesto precedente */}
      <AnimatePresence>
        {deletingAnalysis && (() => {
          const ch = chapters.find((c) => c.id === deletingAnalysis.chapterId)
          const providerCfg = AI_PROVIDER_CONFIG[deletingAnalysis.provider]
          return (
            <>
              <motion.div
                initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}}
                onClick={() => setDeletingAnalysis(null)}
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{opacity: 0, scale: 0.92, y: 16}}
                animate={{opacity: 1, scale: 1, y: 0}}
                exit={{opacity: 0, scale: 0.92}}
                transition={{duration: 0.15}}
                className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-2xl"
              >
                <div className="mb-4 flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-900/30 text-red-400">
                    <Trash2 className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-[var(--text-primary)]">Elimina analisi</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      <span className={providerCfg.color}>{providerCfg.label}</span>
                      {' · '}{ch?.title ?? deletingAnalysis.chapterId}
                    </p>
                  </div>
                </div>
                <p className="mb-5 text-sm text-slate-500">
                  Questa analisi verrà eliminata definitivamente. L'operazione non è reversibile.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeletingAnalysis(null)}
                    className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-[var(--overlay)]"
                  >
                    Annulla
                  </button>
                  <button
                    onClick={async () => {
                      const {chapterId, provider} = deletingAnalysis
                      setDeletingAnalysis(null)
                      await deleteAnalysis(chapterId, provider)
                      // Se era il capitolo selezionato e il provider attivo, deseleziona
                      if (selectedId === chapterId && activeProvider === provider) {
                        setActiveProvider(
                          (Object.keys(analyses[chapterId] ?? {}).find((p) => p !== provider) as AIProvider | undefined)
                          ?? (Object.keys(AI_PROVIDER_CONFIG)[0] as AIProvider)
                        )
                      }
                      toast.success('Analisi eliminata')
                    }}
                    className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500"
                  >
                    Elimina
                  </button>
                </div>
              </motion.div>
            </>
          )
        })()}
      </AnimatePresence>
      <AnimatePresence>
        {reanalysisDialog && (
          <>
            <motion.div
              initial={{opacity: 0}}
              animate={{opacity: 1}}
              exit={{opacity: 0}}
              onClick={() => setReanalysisDialog(null)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{opacity: 0, scale: 0.92, y: 16}}
              animate={{opacity: 1, scale: 1, y: 0}}
              exit={{opacity: 0, scale: 0.92}}
              transition={{duration: 0.18}}
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-2xl"
            >
              <div className="mb-4 flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-900/40 text-violet-400">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-[var(--text-primary)]">Rieseguire l&apos;analisi?</h3>
                  <p className="mt-1 text-sm text-slate-400">{reanalysisDialog.label}</p>
                </div>
              </div>

              <p className="mb-4 text-sm text-slate-500">
                L&apos;analisi sovrascriverà i risultati {AI_PROVIDER_CONFIG[reanalysisDialog.provider].label} esistenti e consumerà token. Scegli come procedere:
              </p>

              {/* Commento autore */}
              <div className="mb-4">
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                  <FileEdit className="h-3.5 w-3.5" />
                  Nota per l&apos;IA
                  <span className="text-slate-600">(opzionale)</span>
                </label>
                <textarea
                  value={reanalysisComment}
                  onChange={(e) => setReanalysisComment(e.target.value)}
                  placeholder="Es: ho riscritto il dialogo del terzo atto, concentrati sulla coerenza dei personaggi…"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 outline-none focus:border-violet-500/40"
                />
                {reanalysisComment.trim() && (
                  <p className="mt-1 text-xs text-slate-600">Questo testo sarà salvato e riutilizzato alla prossima analisi.</p>
                )}
              </div>

              <div className="space-y-2.5">
                {/* Opzione 1: Con contesto precedente */}
                <button
                  onClick={() => void triggerAnalysis(reanalysisDialog.chapterId, true, reanalysisDialog.provider, reanalysisComment)}
                  disabled={triggering}
                  className="flex w-full items-start gap-3 rounded-xl border border-violet-700/40 bg-violet-900/15 p-3.5 text-left transition-colors hover:border-violet-600/60 hover:bg-violet-900/25"
                >
                  <History className="mt-0.5 h-5 w-5 shrink-0 text-violet-400" />
                  <div>
                    <p className="text-sm font-medium text-violet-300">Con contesto precedente</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Invia l&apos;analisi passata (punteggi, correzioni accettate/rifiutate) per valutare il progresso e non ripetere correzioni già applicate.
                    </p>
                  </div>
                </button>

                {/* Opzione 2: Da zero */}
                <button
                  onClick={() => void triggerAnalysis(reanalysisDialog.chapterId, false, reanalysisDialog.provider, reanalysisComment)}
                  disabled={triggering}
                  className="flex w-full items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--overlay)] p-3.5 text-left transition-colors hover:border-[var(--border-strong)] hover:bg-white/[0.07]"
                >
                  <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-sm font-medium text-slate-300">Analisi da zero</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Analisi completamente fresca, senza contesto precedente. Utile se il capitolo è stato riscritto in modo significativo.
                    </p>
                  </div>
                </button>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  onClick={() => setReanalysisDialog(null)}
                  className="rounded-lg px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-[var(--overlay)] hover:text-slate-200"
                >
                  Annulla
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Dialog prima analisi — con campo commento autore */}
      <AnimatePresence>
        {analyzeDialog && (
          <>
            <motion.div
              initial={{opacity: 0}}
              animate={{opacity: 1}}
              exit={{opacity: 0}}
              onClick={() => setAnalyzeDialog(null)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{opacity: 0, scale: 0.92, y: 16}}
              animate={{opacity: 1, scale: 1, y: 0}}
              exit={{opacity: 0, scale: 0.92}}
              transition={{duration: 0.18}}
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-2xl"
            >
              <div className="mb-4 flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-900/40 text-violet-400">
                  <Play className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-[var(--text-primary)]">Avvia analisi</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {AI_PROVIDER_CONFIG[analyzeDialog.provider].icon}{' '}
                    {AI_PROVIDER_CONFIG[analyzeDialog.provider].label}
                    {analyzeDialog.chapterId !== 'all' && (
                      <> · {chapters.find((c) => c.id === analyzeDialog.chapterId)?.title ?? analyzeDialog.chapterId}</>
                    )}
                  </p>
                </div>
              </div>

              {/* Commento autore */}
              <div className="mb-5">
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                  <FileEdit className="h-3.5 w-3.5" />
                  Nota per l&apos;IA
                  <span className="text-slate-600">(opzionale)</span>
                </label>
                <textarea
                  value={authorComment}
                  onChange={(e) => setAuthorComment(e.target.value)}
                  placeholder="Es: ho cambiato il finale, controlla la coerenza con il personaggio di Marco…"
                  rows={4}
                  autoFocus
                  className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-3 py-2.5 text-sm text-slate-300 placeholder:text-slate-600 outline-none focus:border-violet-500/40"
                />
                <p className="mt-1.5 text-xs text-slate-600">
                  {authorComment.trim()
                    ? 'Questo testo sarà salvato e riutilizzato alla prossima analisi di questo capitolo.'
                    : 'Puoi lasciare vuoto per un\'analisi standard. Il testo viene salvato per capitolo.'}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setAnalyzeDialog(null)}
                  className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-[var(--overlay)]"
                >
                  Annulla
                </button>
                <button
                  onClick={() => void triggerAnalysis(analyzeDialog.chapterId, false, analyzeDialog.provider, authorComment)}
                  disabled={triggering}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
                >
                  {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Avvia analisi
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
