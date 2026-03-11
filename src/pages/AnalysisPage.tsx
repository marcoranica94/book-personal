import React, {useEffect, useRef, useState} from 'react'
import {AnimatePresence, motion} from 'framer-motion'
import {
  AlertTriangle,
  AlignLeft,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  Eye,
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
  Upload,
  X
} from 'lucide-react'
import {Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts'
import {useChaptersStore} from '@/stores/chaptersStore'
import {useAnalysisStore} from '@/stores/analysisStore'
import {useCharactersStore} from '@/stores/charactersStore'
import {useDriveStore} from '@/stores/driveStore'
import {useAuthStore} from '@/stores/authStore'
import {useSettingsStore} from '@/stores/settingsStore'
import {toast} from '@/stores/toastStore'
import type {AIProvider, CustomQuestion, ParagraphReformat} from '@/types'
import {AI_PROVIDER_CONFIG, getScoreColor, SyncSource, SyncStatus} from '@/types'
import type {WorkflowRunInfo} from '@/services/githubWorkflow'
import {getLatestWorkflowRun, triggerWorkflow} from '@/services/githubWorkflow'
import {
  checkAnalysisAfter,
  checkCustomQuestionAfter,
  checkErrorAfter,
  checkParagraphReformatAfter,
  checkParagraphReformatErrorAfter,
  deleteParagraphReformat,
  getCustomQuestions,
  getParagraphReformat,
  patchAnalysis,
} from '@/services/analysisService'
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
import RichTextEditor, {type InlineCorrection} from '@/components/editor/RichTextEditor'

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
  verb_tense: 'Tempo verbale',
}

const CORRECTION_TYPE_COLORS: Record<string, string> = {
  grammar: 'border-red-800/30 bg-red-900/30 text-red-400',
  style: 'border-violet-800/30 bg-violet-900/30 text-violet-400',
  clarity: 'border-blue-800/30 bg-blue-900/30 text-blue-400',
  continuity: 'border-amber-800/30 bg-amber-900/30 text-amber-400',
  verb_tense: 'border-purple-800/30 bg-purple-900/30 text-purple-400',
}

type Tab = 'feedback' | 'corrections' | 'extra'
type ExtraTab = 'storico' | 'reazioni' | 'acapo' | 'parole' | 'showdontell' | 'verbtense' | 'domande'

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
  mode?: 'standard' | 'custom_question'
  provider?: AIProvider
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

// ─── Pending paragraph reformat (localStorage persistence) ───────────────────

const LS_PENDING_REFORMAT_KEY = 'book_pending_reformat'

interface PendingReformat {
  chapterId: string
  chapterTitle: string
  triggeredAt: string
}

function loadPendingReformat(): PendingReformat | null {
  try {
    const raw = localStorage.getItem(LS_PENDING_REFORMAT_KEY)
    return raw ? (JSON.parse(raw) as PendingReformat) : null
  } catch { return null }
}

function savePendingReformat(p: PendingReformat | null) {
  if (p) localStorage.setItem(LS_PENDING_REFORMAT_KEY, JSON.stringify(p))
  else localStorage.removeItem(LS_PENDING_REFORMAT_KEY)
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
  item: string | {text: string; quotes?: string[]; solution?: string}
  chapterContent: string
  onClose: () => void
}) {
  const text = typeof item === 'string' ? item : item.text
  const quotes = typeof item === 'string' ? [] : (item.quotes ?? [])
  const solution = typeof item === 'string' ? undefined : item.solution

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

        {/* Citazioni dal testo (solo per debolezze) */}
        {type === 'weaknesses' && allQuotes.length > 0 && (
          <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--overlay)] p-4">
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

        {/* Soluzione proposta dall'IA */}
        {solution && (
          <div className={cn(
            'mb-4 rounded-xl border p-4',
            type === 'weaknesses'
              ? 'border-emerald-800/40 bg-emerald-900/10'
              : 'border-violet-800/40 bg-violet-900/10'
          )}>
            <p className={cn(
              'mb-2 text-xs font-semibold uppercase tracking-wider',
              type === 'weaknesses' ? 'text-emerald-400' : 'text-violet-400'
            )}>
              💡 Soluzione proposta
            </p>
            <p className="text-sm leading-relaxed text-slate-200">{solution}</p>
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
  const {analyses, loadAnalysis, loadAllAnalyses, analysisErrors, loadAnalysisErrors, history: analysisHistory, loadChapterHistory, deleteAnalysis, deleteHistoryEntry, removeError, isLoading} = useAnalysisStore()
  const {config: driveConfig, patchTokens, load: loadDrive} = useDriveStore()
  const {user} = useAuthStore()
  const {settings, loadSettings} = useSettingsStore()
  const [selectedId, setSelectedId] = useState<string>('')
  const [activeTab, setActiveTab] = useState<Tab>('feedback')
  const [activeExtraTab, setActiveExtraTab] = useState<ExtraTab>('storico')
  const [activeProvider, setActiveProvider] = useState<AIProvider>((settings.defaultAIProvider ?? 'claude') as AIProvider)
  const [triggering, setTriggering] = useState(false)
  // Correzioni — 3 stati: accettata / rifiutata / da rivedere (default)
  const [acceptedCorrections, setAcceptedCorrections] = useState<Set<number>>(new Set())
  const [rejectedCorrections, setRejectedCorrections] = useState<Set<number>>(new Set())
  const [isApplying, setIsApplying] = useState(false)
  // Correzioni applicate direttamente via popup inline (escluse dalle decorazioni)
  const [appliedInlineCorrections, setAppliedInlineCorrections] = useState<Set<number>>(new Set())
  // Accordion gruppi correzioni (set dei tipi collassati)
  const [collapsedCorrGroups, setCollapsedCorrGroups] = useState<Set<string>>(new Set())
  // Correzione attiva (evidenziata nell'editor inline)
  const [activeInlineCorrection, setActiveInlineCorrection] = useState<number | null>(null)
  // Editor inline
  const [editorContent, setEditorContent] = useState('')
  // externalSearchQuery: stringa + timestamp per ritriggerare anche se stesso testo
  const [editorSearchQuery, setEditorSearchQuery] = useState('')
  const [isSavingContent, setIsSavingContent] = useState(false)
  const [isForceSyncingDrive, setIsForceSyncingDrive] = useState(false)
  const [isPushingToDrive, setIsPushingToDrive] = useState(false)
  const [appliedChanges, setAppliedChanges] = useState<Array<{original: string; suggested: string}>>([])
  const [itemDetailModal, setItemDetailModal] = useState<{type: 'weaknesses' | 'suggestions'; item: string | {text: string; quotes?: string[]; solution?: string}} | null>(null)
  // Re-analysis dialog — scegli se includere contesto precedente
  const [reanalysisDialog, setReanalysisDialog] = useState<{chapterId: string; label: string; provider: AIProvider} | null>(null)
  // Commento autore — dialog pre-analisi
  const [analyzeDialog, setAnalyzeDialog] = useState<{chapterId: string; provider: AIProvider} | null>(null)
  const [authorComment, setAuthorComment] = useState<string>('')
  // Commento nel dialog di rianalisi
  const [reanalysisComment, setReanalysisComment] = useState<string>('')
  // Opzioni soluzioni — sceglibili separatamente per debolezze e suggerimenti
  const [withWeaknessSolutions, setWithWeaknessSolutions] = useState(true)
  const [withSuggestionSolutions, setWithSuggestionSolutions] = useState(true)
  // Analisi paragrafi — opzionale
  const [withParagraphAnalysis, setWithParagraphAnalysis] = useState(false)
  // Sezioni da includere nell'analisi
  const [withStrengths, setWithStrengths] = useState(true)
  const [withWeaknesses, setWithWeaknesses] = useState(true)
  const [withSuggestions, setWithSuggestions] = useState(true)
  const [withCorrections, setWithCorrections] = useState(true)
  const [withReaderReactions, setWithReaderReactions] = useState(true)
  // Analisi frequenza parole
  const [withWordFrequency, setWithWordFrequency] = useState(false)
  // Show, don't tell
  const [withShowDontTell, setWithShowDontTell] = useState(false)
  // Controllo tempi verbali
  const [withVerbTense, setWithVerbTense] = useState(false)
  // Estrazione personaggi
  const [withCharacters, setWithCharacters] = useState(false)
  // Domanda personalizzata — campo nel dialog
  const [customQuestion, setCustomQuestion] = useState('')
  // Domande personalizzate già risposte per il capitolo selezionato
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([])
  // ID domanda espansa nel tab Domande
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null)
  const [pendingReformat, setPendingReformat] = useState<PendingReformat | null>(() => loadPendingReformat())
  const [reformatResult, setReformatResult] = useState<ParagraphReformat | null>(null)
  const [reformatElapsed, setReformatElapsed] = useState(0)
  const [reformatWorkflowRun, setReformatWorkflowRun] = useState<WorkflowRunInfo | null>(null)
  const [isApplyingReformat, setIsApplyingReformat] = useState(false)
  const [triggeringReformat, setTriggeringReformat] = useState(false)
  // Storico analisi — ID capitolo espanso nella tabella confronto
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)
  // Cancellazione analisi — traccia quale provider è in corso di delete
  const [deletingAnalysis, setDeletingAnalysis] = useState<{chapterId: string; provider: AIProvider} | null>(null)
  // Modale dettaglio voce storico
  const [historyDetailModal, setHistoryDetailModal] = useState<{entry: import('@/types').ChapterAnalysis; chapterTitle: string; provider: AIProvider} | null>(null)
  // Editor fullscreen
  const [editorFullscreen, setEditorFullscreen] = useState(false)
  // Pending analysis progress
  const [pendingAnalysis, setPendingAnalysis] = useState<PendingAnalysis | null>(() => loadPending())
  const [workflowRun, setWorkflowRun] = useState<WorkflowRunInfo | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const isApplyingRef = useRef(false)
  const analysisSectionRef = useRef<HTMLDivElement>(null)

  // ── Compact sezioni picker — shared between both analysis dialogs ──────────
  const chipCls = (checked: boolean, on: string) =>
    cn(
      'flex w-full cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all select-none',
      checked ? on : 'border-[var(--border)] text-slate-500 hover:border-slate-500 hover:text-slate-400',
    )
  const subChipCls = (checked: boolean, on: string) =>
    cn(
      'flex cursor-pointer items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-all select-none ml-2',
      checked ? on : 'border-[var(--border)] text-slate-600 hover:border-slate-500',
    )
  const renderSezioniPicker = () => (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--overlay)] p-3">
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Sezioni da analizzare</p>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
        {/* ── Standard ── */}
        <div className="flex flex-col gap-1.5">
          <label className={chipCls(withStrengths, 'border-emerald-500/50 bg-emerald-900/20 text-emerald-400')}>
            <input type="checkbox" className="sr-only" checked={withStrengths} onChange={(e) => setWithStrengths(e.target.checked)} />
            ✓ Punti di forza
          </label>
          <label className={chipCls(withWeaknesses, 'border-amber-500/50 bg-amber-900/20 text-amber-400')}>
            <input type="checkbox" className="sr-only" checked={withWeaknesses} onChange={(e) => setWithWeaknesses(e.target.checked)} />
            ⚠ Debolezze
          </label>
          {withWeaknesses && (
            <label className={subChipCls(withWeaknessSolutions, 'border-amber-600/40 bg-amber-900/15 text-amber-500')}>
              <input type="checkbox" className="sr-only" checked={withWeaknessSolutions} onChange={(e) => setWithWeaknessSolutions(e.target.checked)} />
              + con soluzioni
            </label>
          )}
          <label className={chipCls(withSuggestions, 'border-violet-500/50 bg-violet-900/20 text-violet-400')}>
            <input type="checkbox" className="sr-only" checked={withSuggestions} onChange={(e) => setWithSuggestions(e.target.checked)} />
            💡 Suggerimenti
          </label>
          {withSuggestions && (
            <label className={subChipCls(withSuggestionSolutions, 'border-violet-600/40 bg-violet-900/15 text-violet-500')}>
              <input type="checkbox" className="sr-only" checked={withSuggestionSolutions} onChange={(e) => setWithSuggestionSolutions(e.target.checked)} />
              + con soluzioni
            </label>
          )}
          <label className={chipCls(withCorrections, 'border-rose-500/50 bg-rose-900/20 text-rose-400')}>
            <input type="checkbox" className="sr-only" checked={withCorrections} onChange={(e) => setWithCorrections(e.target.checked)} />
            ✏ Correzioni
          </label>
          <label className={chipCls(withReaderReactions, 'border-sky-500/50 bg-sky-900/20 text-sky-400')}>
            <input type="checkbox" className="sr-only" checked={withReaderReactions} onChange={(e) => setWithReaderReactions(e.target.checked)} />
            👁 Reazioni lettori
          </label>
        </div>
        {/* ── Extra ── */}
        <div className="flex flex-col gap-1.5">
          <p className="mb-0.5 text-xs text-slate-600">Extra (aggiungono tab)</p>
          <label className={chipCls(withParagraphAnalysis, 'border-teal-500/50 bg-teal-900/20 text-teal-400')}>
            <input type="checkbox" className="sr-only" checked={withParagraphAnalysis} onChange={(e) => setWithParagraphAnalysis(e.target.checked)} />
            ¶ Analizza a capo
          </label>
          <label className={chipCls(withWordFrequency, 'border-indigo-500/50 bg-indigo-900/20 text-indigo-400')}>
            <input type="checkbox" className="sr-only" checked={withWordFrequency} onChange={(e) => setWithWordFrequency(e.target.checked)} />
            📊 Ripetizioni
          </label>
          <label className={chipCls(withShowDontTell, 'border-orange-500/50 bg-orange-900/20 text-orange-400')}>
            <input type="checkbox" className="sr-only" checked={withShowDontTell} onChange={(e) => setWithShowDontTell(e.target.checked)} />
            👁 Show Don&apos;t Tell
          </label>
          <label className={chipCls(withVerbTense, 'border-purple-500/50 bg-purple-900/20 text-purple-400')}>
            <input type="checkbox" className="sr-only" checked={withVerbTense} onChange={(e) => setWithVerbTense(e.target.checked)} />
            ⏱ Tempi verbali
          </label>
          <label className={chipCls(withCharacters, 'border-cyan-500/50 bg-cyan-900/20 text-cyan-400')}>
            <input type="checkbox" className="sr-only" checked={withCharacters} onChange={(e) => setWithCharacters(e.target.checked)} />
            👤 Estrai personaggi
          </label>
        </div>
      </div>
    </div>
  )

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

  // Scroll all'analisi quando cambia provider
  useEffect(() => {
    analysisSectionRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'})
  }, [activeProvider])

  // Reset editor + corrections when switching chapter
  useEffect(() => {
    if (selectedId) void loadAnalysis(selectedId)
    setAcceptedCorrections(new Set())
    setRejectedCorrections(new Set())
    setAppliedChanges([])
    setAppliedInlineCorrections(new Set())
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
        const isCustomQuestion = pending.mode === 'custom_question'

        const [isDone, hasError] = await Promise.all([
          isCustomQuestion
            ? checkCustomQuestionAfter(pending.chapterId, pending.triggeredAt)
            : checkAnalysisAfter(pending.chapterId, pending.triggeredAt),
          checkErrorAfter(pending.chapterId, pending.triggeredAt),
        ])

        if (isDone) {
          // Solo qui aggiorniamo lo store → un unico re-render al completamento
          if (isCustomQuestion) {
            const questions = await getCustomQuestions(pending.chapterId)
            setCustomQuestions(questions)
            toast.success(`Risposta alla domanda ricevuta per "${pending.chapterTitle}"!`)
            if (pending.chapterId !== 'all') {
              setSelectedId(pending.chapterId)
              setActiveTab('extra')
              setActiveExtraTab('domande')
              window.scrollTo({top: 0, behavior: 'smooth'})
            }
          } else {
            if (pending.chapterId === 'all') {
              await loadAllAnalyses()
            } else {
              await loadAnalysis(pending.chapterId)
            }
            await loadAnalysisErrors()
            toast.success(`Analisi completata per "${pending.chapterTitle}"!`)
            if (pending.chapterId !== 'all') {
              setSelectedId(pending.chapterId)
              if (pending.provider) setActiveProvider(pending.provider)
              setActiveTab('feedback')
              setActiveExtraTab('storico')
              window.scrollTo({top: 0, behavior: 'smooth'})
            }
            // Reload characters after a delay — upsertCharacters runs after saveAnalysis in the script
            if (withCharacters) {
              setTimeout(() => {
                const prevCount = useCharactersStore.getState().characters.length
                void useCharactersStore.getState().load().then(() => {
                  const newCount = useCharactersStore.getState().characters.length
                  const diff = newCount - prevCount
                  if (diff > 0) toast.info(`${diff} nuov${diff === 1 ? 'o' : 'i'} personagg${diff === 1 ? 'io' : 'i'} aggiunt${diff === 1 ? 'o' : 'i'} nella pagina Personaggi`)
                  else toast.info('Personaggi aggiornati nella pagina Personaggi')
                })
              }, 3000)
            }
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

  // ─── Reformat progress polling ─────────────────────────────────────────────
  useEffect(() => {
    if (!pendingReformat) {
      setReformatElapsed(0)
      return
    }
    const pending = pendingReformat
    setReformatElapsed(Math.floor((Date.now() - new Date(pending.triggeredAt).getTime()) / 1000))
    const tickId = setInterval(() => {
      setReformatElapsed(Math.floor((Date.now() - new Date(pending.triggeredAt).getTime()) / 1000))
    }, 1000)

    async function poll() {
      try {
        const run = await getLatestWorkflowRun(GITHUB_REPO_OWNER, GITHUB_REPO_NAME, 'format-paragraphs.yml')
        if (run) setReformatWorkflowRun(run)

        const [isDone, hasError] = await Promise.all([
          checkParagraphReformatAfter(pending.chapterId, pending.triggeredAt),
          checkParagraphReformatErrorAfter(pending.chapterId, pending.triggeredAt),
        ])

        if (isDone) {
          const result = await getParagraphReformat(pending.chapterId)
          setReformatResult(result)
          toast.success(`Riformattazione completata per "${pending.chapterTitle}"!`)
          if (pending.chapterId === selectedId) {
            setActiveTab('extra')
            setActiveExtraTab('acapo')
            window.scrollTo({top: 0, behavior: 'smooth'})
          }
          savePendingReformat(null)
          setPendingReformat(null)
          setReformatWorkflowRun(null)
          return
        }

        if (hasError && run?.status === 'completed') {
          toast.error(`Riformattazione fallita per "${pending.chapterTitle}"`)
          savePendingReformat(null)
          setPendingReformat(null)
          setReformatWorkflowRun(null)
          return
        }

        if (run?.conclusion === 'failure') {
          toast.error(`Riformattazione fallita per "${pending.chapterTitle}"`)
          savePendingReformat(null)
          setPendingReformat(null)
          setReformatWorkflowRun(null)
          return
        }

        if (Date.now() - new Date(pending.triggeredAt).getTime() > 10 * 60 * 1000) {
          toast.warning(`Timeout riformattazione "${pending.chapterTitle}" — controlla GitHub Actions`)
          savePendingReformat(null)
          setPendingReformat(null)
          setReformatWorkflowRun(null)
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
  }, [pendingReformat, selectedId])

  // ─── Load reformat result when switching chapter ───────────────────────────
  useEffect(() => {
    if (!selectedId) { setReformatResult(null); return }
    void getParagraphReformat(selectedId).then(setReformatResult)
  }, [selectedId])

  // ─── Load custom questions when switching chapter ──────────────────────────
  useEffect(() => {
    if (!selectedId) { setCustomQuestions([]); return }
    void getCustomQuestions(selectedId).then(setCustomQuestions)
  }, [selectedId])

  const selectedChapter = chapters.find((c) => c.id === selectedId) ?? null
  const chapterAnalyses = selectedId ? (analyses[selectedId] ?? null) : null
  const analysis = chapterAnalyses?.[activeProvider] ?? null
  const availableProviders = chapterAnalyses ? (Object.keys(chapterAnalyses) as AIProvider[]) : []
  const isDirty = editorContent !== (selectedChapter?.driveContent ?? '')
  const isPendingPush = isDirty || selectedChapter?.syncStatus === SyncStatus.PENDING_PUSH
  const isGoogleDoc = selectedChapter?.driveMimeType === 'application/vnd.google-apps.document'

  async function triggerAnalysis(chapterId: string, includePrevious = false, provider: AIProvider = activeProvider, comment?: string, question?: string) {
    // Blocca se c'è già un'analisi in corso
    if (pendingAnalysis) {
      toast.warning(`Analisi già in corso per "${pendingAnalysis.chapterTitle}" — attendi il completamento prima di avviarne un'altra`)
      return
    }

    const isCustomQuestion = !!question?.trim()

    const hasExisting =
      chapterId === 'all'
        ? Object.keys(analyses).length > 0
        : !!analyses[chapterId]?.[provider]

    // Le domande personalizzate non richiedono dialog di conferma rianalisi
    if (!isCustomQuestion) {
      // Se non è ancora passato dal dialog di primo avvio, mostralo
      if (!hasExisting && !analyzeDialog && comment === undefined) {
        const saved = chapterId !== 'all' ? getAuthorComment(chapterId) : ''
        setAuthorComment(saved)
        setCustomQuestion('')
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
    }

    // Se è una domanda personalizzata apri il dialog (se non ancora aperto)
    if (isCustomQuestion && !analyzeDialog && comment === undefined) {
      setCustomQuestion(question ?? '')
      const saved = chapterId !== 'all' ? getAuthorComment(chapterId) : ''
      setAuthorComment(saved)
      setAnalyzeDialog({chapterId, provider})
      return
    }

    // Salva il commento per questo capitolo (se fornito e non "all")
    if (!isCustomQuestion && comment !== undefined && chapterId !== 'all') {
      saveAuthorComment(chapterId, comment)
    }

    setAnalyzeDialog(null)
    setReanalysisDialog(null)
    setCustomQuestion('')
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
        with_weakness_solutions: withWeaknessSolutions ? 'true' : 'false',
        with_suggestion_solutions: withSuggestionSolutions ? 'true' : 'false',
        with_paragraph_analysis: withParagraphAnalysis ? 'true' : 'false',
        with_strengths: withStrengths ? 'true' : 'false',
        with_weaknesses: withWeaknesses ? 'true' : 'false',
        with_suggestions: withSuggestions ? 'true' : 'false',
        with_corrections: withCorrections ? 'true' : 'false',
        with_reader_reactions: withReaderReactions ? 'true' : 'false',
        with_word_frequency: withWordFrequency ? 'true' : 'false',
        with_show_dont_tell: withShowDontTell ? 'true' : 'false',
        with_verb_tense: withVerbTense ? 'true' : 'false',
        with_characters: withCharacters ? 'true' : 'false',
      }

      if (isCustomQuestion) {
        workflowInputs.custom_question = question!.trim()
      } else {
        // Aggiungi il commento autore se presente (non vuoto)
        const effectiveComment = comment ?? (chapterId !== 'all' ? getAuthorComment(chapterId) : '')
        if (effectiveComment.trim()) {
          workflowInputs.author_comment = effectiveComment.trim()
        }
      }

      await triggerWorkflow(GITHUB_REPO_OWNER, GITHUB_REPO_NAME, 'ai-analysis.yml', workflowInputs)
      const chapterTitle =
        chapterId === 'all'
          ? 'tutti i capitoli'
          : (chapters.find((c) => c.id === chapterId)?.title ?? chapterId)
      const mode = isCustomQuestion ? 'custom_question' : 'standard'
      const pending: PendingAnalysis = {chapterId, chapterTitle, triggeredAt: new Date().toISOString(), mode, provider}
      savePending(pending)
      setPendingAnalysis(pending)
      setElapsedSeconds(0)
      if (isCustomQuestion) {
        toast.success(`Domanda inviata per "${chapterTitle}" — risposta in arrivo!`)
      } else {
        toast.success(`Analisi ${AI_PROVIDER_CONFIG[provider].label} avviata per "${chapterTitle}"${includePrevious ? ' (con contesto precedente)' : ''}! Monitoraggio attivato.`)
      }
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
      // Usa editorContent come base (più affidabile di driveContent dopo apply ripetuti)
      const baseContent = editorContent || selectedChapter.driveContent || ''
      const { content, applied, notFound } = applyCorrectionsToContent(
        baseContent,
        analysis.corrections,
        acceptedCorrections,
      )
      const accepted = Array.from(acceptedCorrections)

      // Merge con le correzioni già accettate/rifiutate dall'analisi
      const prevAccepted = analysis.acceptedCorrections ?? []
      const prevRejected = analysis.rejectedCorrections ?? []
      const mergedAccepted = Array.from(new Set([...prevAccepted, ...accepted]))
      const mergedRejected = [
        ...prevRejected.filter((i) => !accepted.includes(i)),
        ...Array.from(rejectedCorrections).filter((i) => !prevRejected.includes(i)),
      ]

      // Scritture in parallelo per ridurre la latenza
      await Promise.all([
        chaptersService.updateChapter(selectedChapter.id, {
          driveContent: content,
          syncStatus: SyncStatus.PENDING_PUSH,
          syncSource: SyncSource.AI,
        }),
        patchAnalysis(selectedChapter.id, {
          acceptedCorrections: mergedAccepted,
          rejectedCorrections: mergedRejected,
          appliedAt: new Date().toISOString(),
        }, activeProvider),
      ])
      await Promise.all([loadChapters(), loadAnalysis(selectedId)])

      // Salva le modifiche per mostrarle nell'editor
      const changes = accepted
        .map((i) => analysis.corrections[i])
        .filter((c) => !!c && baseContent.includes(c.original))
        .map((c) => ({original: c!.original, suggested: c!.suggested}))
      setAppliedChanges((prev) => [...prev, ...changes])
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

  async function triggerReformat() {
    if (!selectedChapter) return
    setTriggeringReformat(true)
    try {
      await triggerWorkflow(GITHUB_REPO_OWNER, GITHUB_REPO_NAME, 'format-paragraphs.yml', {
        chapter_id: selectedChapter.id,
        ai_provider: activeProvider,
      })
      const pending: PendingReformat = {
        chapterId: selectedChapter.id,
        chapterTitle: selectedChapter.title,
        triggeredAt: new Date().toISOString(),
      }
      savePendingReformat(pending)
      setPendingReformat(pending)
      setReformatElapsed(0)
      toast.success(`Riformattazione paragrafi avviata per "${selectedChapter.title}"! Monitoraggio attivato.`)
    } catch (err) {
      toast.error('Errore: ' + (err as Error).message)
    } finally {
      setTriggeringReformat(false)
    }
  }

  async function handleApplyReformat() {
    if (!selectedChapter || !reformatResult) return
    setIsApplyingReformat(true)
    try {
      const newContent = reformatResult.reformattedText
      await chaptersService.updateChapter(selectedChapter.id, {
        driveContent: newContent,
        currentChars: newContent.length,
        wordCount: newContent.split(/\s+/).filter(Boolean).length,
        syncStatus: SyncStatus.PENDING_PUSH,
        syncSource: SyncSource.AI,
      })
      await loadChapters()
      setEditorContent(newContent)
      // Pulisci la riformattazione dopo che è stata applicata
      await deleteParagraphReformat(selectedChapter.id)
      setReformatResult(null)
      toast.success('Testo riformattato applicato — usa "Sincronizza ora" per inviarlo su Drive')
    } catch (err) {
      toast.error('Errore applicazione: ' + (err as Error).message)
    } finally {
      setIsApplyingReformat(false)
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
    setAcceptedCorrections(new Set((analysis.corrections ?? []).map((_, i) => i)))
    setRejectedCorrections(new Set())
  }

  function deselectAllCorrections() {
    setAcceptedCorrections(new Set())
    setRejectedCorrections(new Set())
  }

  // Chapters with analysis sorted by title (natural numeric — handles es. 'Capitolo 1-A', '1-B')
  const analyzedChapters = [...chapters]
    .filter((c) => analyses[c.id] && Object.keys(analyses[c.id]).length > 0)
    .sort((a, b) => a.title.localeCompare(b.title, 'it', {numeric: true, sensitivity: 'base'}))


  // Inline corrections per l'editor (escluse quelle già applicate via popup)
  const inlineCorrections: InlineCorrection[] = (analysis?.corrections ?? [])
    .map((c, i) => ({index: i, original: c.original, suggested: c.suggested, type: c.type, note: c.note}))
    .filter((c) => !appliedInlineCorrections.has(c.index))

  // Applica una correzione direttamente dall'editor (popup inline) — sostituzione immediata
  function handleAcceptInline(idx: number) {
    const corr = analysis?.corrections[idx]
    if (!corr) return
    setEditorContent((prev) => prev.replace(corr.original, corr.suggested))
    setAppliedInlineCorrections((prev) => new Set([...prev, idx]))
    setAcceptedCorrections((prev) => { const s = new Set(prev); s.delete(idx); return s })
    setRejectedCorrections((prev) => { const s = new Set(prev); s.delete(idx); return s })
  }

  return (
    <div className="flex flex-col gap-4 p-6">

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
            setActiveTab('feedback')
          }}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-slate-300 outline-none focus:border-violet-500/40"
        >
          <option value="">— Seleziona capitolo —</option>
          {[...chapters].filter((c) => c.title.toLowerCase().startsWith('capitolo')).sort((a, b) => a.title.localeCompare(b.title, 'it', {numeric: true, sensitivity: 'base'})).map((c) => (
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

        {/* Domanda personalizzata */}
        {selectedId && (
          <button
            onClick={() => {
              if (!selectedId) return
              setCustomQuestion('')
              setAuthorComment(getAuthorComment(selectedId))
              setAnalyzeDialog({chapterId: selectedId, provider: activeProvider})
            }}
            disabled={!selectedId || triggering || !!pendingAnalysis}
            title="Fai una domanda precisa sull'IA per questo capitolo"
            className="flex items-center gap-1.5 rounded-lg border border-violet-700/40 bg-violet-900/20 px-3 py-2 text-sm text-violet-400 transition-colors hover:bg-violet-900/40 hover:text-violet-300 disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" />
            Chiedi
          </button>
        )}

        {/* Trigger all */}
        <button
          onClick={() => void triggerAnalysis('all')}
          disabled={triggering || chapters.length === 0 || pendingAnalysis?.chapterId === 'all'}
          title="Analizza tutti i capitoli"
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-[var(--overlay)] hover:text-slate-200 disabled:opacity-40"
        >
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

      {/* Pending reformat banner */}
      <AnimatePresence>
        {pendingReformat && (
          <motion.div
            key="pending-reformat-banner"
            initial={{opacity: 0, y: -8}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: -8}}
            className="flex items-center gap-3 rounded-xl border border-teal-800/40 bg-teal-900/20 px-4 py-3"
          >
            <AlignLeft className="h-4 w-4 shrink-0 animate-pulse text-teal-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-teal-300">
                Riformattazione paragrafi in corso — {pendingReformat.chapterTitle}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {reformatWorkflowRun ? (
                  <>
                    GitHub Actions:{' '}
                    <span className={
                      reformatWorkflowRun.status === 'in_progress' ? 'text-amber-400' :
                      reformatWorkflowRun.status === 'queued' ? 'text-blue-400' : 'text-slate-400'
                    }>
                      {reformatWorkflowRun.status === 'queued' ? 'In coda' :
                       reformatWorkflowRun.status === 'in_progress' ? 'In esecuzione' :
                       reformatWorkflowRun.status}
                    </span>
                    {' · '}
                  </>
                ) : null}
                Avviata {formatElapsed(reformatElapsed)} fa · aggiornamento ogni 15s
              </p>
            </div>
            <button
              onClick={() => {savePendingReformat(null); setPendingReformat(null); setReformatWorkflowRun(null)}}
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
            {/* Close button */}
            <div className="flex items-center justify-end">
              <button
                onClick={() => { setSelectedId(''); setActiveTab('feedback'); }}
                title="Chiudi analisi e torna al confronto"
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-slate-500 transition-colors hover:bg-[var(--overlay)] hover:text-slate-300"
              >
                <X className="h-3.5 w-3.5" />
                Chiudi analisi
              </button>
            </div>
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
                            {isActive && hasAnalysis && (
                              <span className="rounded-full border border-emerald-700/30 bg-emerald-900/50 px-1.5 py-px text-[9px] font-medium text-emerald-400">
                                ultima
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

                {/* ── Split-pane: LEFT analysis + RIGHT editor ── */}
                <div ref={analysisSectionRef} className="grid grid-cols-[42%_1fr] gap-4 items-start">
                  {/* ──────── LEFT: Analysis panel ──────────── */}
                  <div
                    className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]"
                    style={{maxHeight: 'calc(100vh - 160px)'}}
                  >
                    {/* Compact scores header */}
                    <div className="shrink-0 border-b border-[var(--border)] p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <ProgressRing
                          value={analysis.scores.overall * 10}
                          size={72}
                          stroke={7}
                          label={analysis.scores.overall.toFixed(1)}
                          sublabel="overall"
                        />
                        <div className="flex-1 grid grid-cols-2 gap-x-3 gap-y-1.5">
                          {Object.entries(SCORE_LABELS).map(([key, label]) => (
                            <ScoreBar
                              key={key}
                              label={label}
                              value={analysis.scores[key as keyof typeof analysis.scores] as number}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="text-xs leading-relaxed text-slate-400 line-clamp-2">{analysis.summary}</p>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-600">{formatRelativeDate(analysis.analyzedAt)} · {analysis.model}</p>
                        {analysis.authorComment && (
                          <span title={analysis.authorComment} className="cursor-help text-xs text-violet-500 truncate max-w-[140px]">
                            📝 nota autore
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Tab bar — 3 tabs */}
                    <div className="shrink-0 flex border-b border-[var(--border)]">
                      {([
                        {id: 'feedback' as Tab, label: 'Feedback', count: (analysis.strengths?.length ?? 0) + (analysis.weaknesses?.length ?? 0) + (analysis.suggestions?.length ?? 0)},
                        {id: 'corrections' as Tab, label: 'Correzioni', count: analysis.corrections?.length ?? 0},
                        {id: 'extra' as Tab, label: 'Altro', count: undefined},
                      ] as {id: Tab; label: string; count?: number}[]).map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={cn(
                            'flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-xs font-medium transition-colors',
                            activeTab === tab.id
                              ? 'border-violet-500 text-violet-300'
                              : 'border-transparent text-slate-500 hover:text-slate-300'
                          )}
                        >
                          {tab.label}
                          {tab.count != null && (
                            <span className={cn(
                              'rounded-full px-1.5 py-0.5 text-xs tabular-nums',
                              activeTab === tab.id ? 'bg-violet-900/30 text-violet-300' : 'bg-[var(--overlay)] text-slate-500'
                            )}>{tab.count}</span>
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Scrollable tab content */}
                    <div className="flex-1 overflow-y-auto p-4 min-h-0">
                      <AnimatePresence mode="wait">

                        {/* ── FEEDBACK TAB: strengths + weaknesses + suggestions ── */}
                        {activeTab === 'feedback' && (
                          <motion.div key="feedback" initial={{opacity:0,x:-4}} animate={{opacity:1,x:0}} exit={{opacity:0}} transition={{duration:0.15}} className="space-y-5">
                            {/* Strengths */}
                            {(analysis.strengths?.length ?? 0) > 0 && (
                              <div>
                                <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-500">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                                  Punti di forza ({analysis.strengths.length})
                                </p>
                                <ul className="space-y-1.5">
                                  {analysis.strengths.map((item, i) => (
                                    <li key={i} className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-3 py-2 text-sm">
                                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                                      <span className="text-slate-300 leading-relaxed">{item}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Weaknesses */}
                            {(analysis.weaknesses?.length ?? 0) > 0 && (
                              <div>
                                <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-500">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                                  Debolezze ({analysis.weaknesses.length})
                                </p>
                                <ul className="space-y-1.5">
                                  {analysis.weaknesses.map((item, i) => {
                                    const itemText = typeof item === 'string' ? item : item.text
                                    const itemQuotes = typeof item === 'string' ? [] : ((item as {quotes?: string[]}).quotes ?? [])
                                    const itemSolution = typeof item === 'string' ? undefined : (item as {solution?: string}).solution
                                    return (
                                      <li
                                        key={i}
                                        onClick={() => {
                                          setItemDetailModal({type: 'weaknesses', item})
                                          if (itemQuotes.length > 0) {
                                            setActiveTab('editor' as Tab)
                                            setEditorSearchQuery(itemQuotes[0])
                                            setTimeout(() => setEditorSearchQuery(''), 100)
                                          }
                                        }}
                                        className="cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-3 py-2 text-sm transition-colors hover:border-[var(--border-strong)] hover:bg-white/[0.07]"
                                      >
                                        <div className="flex items-start gap-2">
                                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                                          <div className="flex-1 min-w-0">
                                            <span className="text-[var(--text-primary)] leading-relaxed">{itemText}</span>
                                            {itemQuotes.length > 0 && (
                                              <p className="mt-1 truncate text-xs italic text-slate-500">&ldquo;{itemQuotes[0]}&rdquo;</p>
                                            )}
                                            {itemSolution && <p className="mt-0.5 text-xs font-medium text-emerald-500">💡 soluzione disponibile</p>}
                                          </div>
                                          <span className="shrink-0 text-xs text-slate-600 mt-0.5">→</span>
                                        </div>
                                      </li>
                                    )
                                  })}
                                </ul>
                              </div>
                            )}

                            {/* Suggestions */}
                            {(analysis.suggestions?.length ?? 0) > 0 && (
                              <div>
                                <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
                                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                                  Suggerimenti ({analysis.suggestions.length})
                                </p>
                                <ul className="space-y-1.5">
                                  {analysis.suggestions.map((item, i) => {
                                    const itemText = typeof item === 'string' ? item : item.text
                                    const itemQuotesSugg = typeof item === 'string' ? [] : ((item as {quotes?: string[]}).quotes ?? [])
                                    const itemSolution = typeof item === 'string' ? undefined : (item as {solution?: string}).solution
                                    return (
                                      <li
                                        key={i}
                                        onClick={() => {
                                          setItemDetailModal({type: 'suggestions', item})
                                          if (itemQuotesSugg.length > 0) {
                                            setActiveTab('editor' as Tab)
                                            setEditorSearchQuery(itemQuotesSugg[0])
                                            setTimeout(() => setEditorSearchQuery(''), 100)
                                          }
                                        }}
                                        className="cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-3 py-2 text-sm transition-colors hover:border-[var(--border-strong)] hover:bg-white/[0.07]"
                                      >
                                        <div className="flex items-start gap-2">
                                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                                          <div className="flex-1 min-w-0">
                                            <span className="text-[var(--text-primary)] leading-relaxed">{itemText}</span>
                                            {itemSolution && <p className="mt-0.5 text-xs font-medium text-violet-400">💡 soluzione disponibile</p>}
                                          </div>
                                          <span className="shrink-0 text-xs text-slate-600 mt-0.5">→</span>
                                        </div>
                                      </li>
                                    )
                                  })}
                                </ul>
                              </div>
                            )}

                            {(analysis.strengths?.length ?? 0) === 0 && (analysis.weaknesses?.length ?? 0) === 0 && (analysis.suggestions?.length ?? 0) === 0 && (
                              <p className="text-sm text-slate-600">Nessun dato di feedback disponibile.</p>
                            )}
                          </motion.div>
                        )}

                        {/* ── CORRECTIONS TAB ── */}
                        {activeTab === 'corrections' && (
                          <motion.div key="corrections" initial={{opacity:0,x:-4}} animate={{opacity:1,x:0}} exit={{opacity:0}} transition={{duration:0.15}}>
                            {(analysis.corrections?.length ?? 0) === 0 ? (
                              <p className="text-sm text-slate-600">Nessuna correzione suggerita.</p>
                            ) : (
                              <div className="space-y-3">
                                {analysis.appliedAt && (
                                  <div className="flex items-center gap-2 rounded-lg border border-emerald-800/30 bg-emerald-900/15 px-3 py-2">
                                    <CheckCheck className="h-3.5 w-3.5 text-emerald-400" />
                                    <span className="text-xs text-emerald-400">
                                      Revisionate il {new Date(analysis.appliedAt).toLocaleDateString('it-IT')} · {analysis.acceptedCorrections?.length ?? 0} accettate
                                    </span>
                                  </div>
                                )}
                                {!editorContent && !selectedChapter?.driveContent && (
                                  <p className="text-xs text-amber-400 rounded-lg border border-amber-800/30 bg-amber-900/10 px-3 py-2">
                                    Sincronizza da Drive per applicare le correzioni
                                  </p>
                                )}
                                <div className="flex flex-wrap items-center gap-2">
                                  <button onClick={selectAllCorrections} className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-slate-400 transition-colors hover:bg-[var(--overlay)] hover:text-slate-200">
                                    <CheckCheck className="h-3 w-3" /> Accetta tutte
                                  </button>
                                  <button onClick={deselectAllCorrections} className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-slate-400 transition-colors hover:bg-[var(--overlay)] hover:text-slate-200">
                                    <Square className="h-3 w-3" /> Resetta
                                  </button>
                                  {(acceptedCorrections.size > 0 || rejectedCorrections.size > 0) && (
                                    <span className="text-xs text-slate-500">
                                      {acceptedCorrections.size > 0 && <span className="text-emerald-500">{acceptedCorrections.size} ✓</span>}
                                      {acceptedCorrections.size > 0 && rejectedCorrections.size > 0 && <span className="mx-1 text-slate-700">·</span>}
                                      {rejectedCorrections.size > 0 && <span className="text-red-400">{rejectedCorrections.size} ✗</span>}
                                    </span>
                                  )}
                                  <div className="flex-1" />
                                  <button
                                    onClick={() => void handleApplyCorrections()}
                                    disabled={acceptedCorrections.size === 0 || isApplying || (!editorContent && !selectedChapter?.driveContent)}
                                    className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
                                  >
                                    {isApplying ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileEdit className="h-3 w-3" />}
                                    Applica {acceptedCorrections.size > 0 ? acceptedCorrections.size : ''}
                                  </button>
                                </div>
                                {/* Correction list grouped by type */}
                                {(() => {
                                  const TYPE_ORDER = ['grammar', 'style', 'clarity', 'continuity']
                                  const groups = TYPE_ORDER
                                    .map((type) => ({type, items: (analysis.corrections ?? []).map((c, i) => ({c, i})).filter(({c}) => c.type === type)}))
                                    .filter(({items}) => items.length > 0)
                                  const knownTypes = new Set(TYPE_ORDER)
                                  const others = (analysis.corrections ?? []).map((c, i) => ({c, i})).filter(({c}) => !knownTypes.has(c.type))
                                  if (others.length > 0) groups.push({type: 'other', items: others})
                                  return groups.map(({type, items}) => {
                                    const groupAccepted = items.filter(({i}) => acceptedCorrections.has(i)).length
                                    const groupRejected = items.filter(({i}) => rejectedCorrections.has(i)).length
                                    const groupPending = items.length - groupAccepted - groupRejected
                                    const allGroupAccepted = items.every(({i}) => acceptedCorrections.has(i))
                                    return (
                                      <div key={type} className="rounded-xl border border-[var(--border)] overflow-hidden">
                                        <button
                                          type="button"
                                          onClick={() => setCollapsedCorrGroups((prev) => {
                                            const next = new Set(prev)
                                            next.has(type) ? next.delete(type) : next.add(type)
                                            return next
                                          })}
                                          className={cn(
                                            'flex w-full items-center gap-3 px-4 py-2.5 transition-colors hover:brightness-110',
                                            type === 'grammar' ? 'bg-red-900/10' : type === 'style' ? 'bg-violet-900/10' : type === 'clarity' ? 'bg-blue-900/10' : type === 'continuity' ? 'bg-amber-900/10' : 'bg-slate-900/10',
                                            !collapsedCorrGroups.has(type) && (type === 'grammar' ? 'border-b border-red-800/20' : type === 'style' ? 'border-b border-violet-800/20' : type === 'clarity' ? 'border-b border-blue-800/20' : type === 'continuity' ? 'border-b border-amber-800/20' : 'border-b border-slate-700/20')
                                          )}
                                        >
                                          <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', CORRECTION_TYPE_COLORS[type] ?? 'border-[var(--border)] bg-[var(--overlay)] text-slate-400')}>
                                            {CORRECTION_TYPE_LABELS[type] ?? type}
                                          </span>
                                          <span className="text-xs text-slate-500">{items.length}</span>
                                          <div className="flex items-center gap-1.5 text-xs">
                                            {groupAccepted > 0 && <span className="text-emerald-500">✓{groupAccepted}</span>}
                                            {groupRejected > 0 && <span className="text-red-400">✗{groupRejected}</span>}
                                            {groupPending > 0 && <span className="text-slate-600">◯{groupPending}</span>}
                                          </div>
                                          <div className="flex-1" />
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              if (allGroupAccepted) {
                                                setAcceptedCorrections((prev) => { const next = new Set(prev); items.forEach(({i}) => next.delete(i)); return next })
                                              } else {
                                                setAcceptedCorrections((prev) => { const next = new Set(prev); items.forEach(({i}) => next.add(i)); return next })
                                                setRejectedCorrections((prev) => { const next = new Set(prev); items.forEach(({i}) => next.delete(i)); return next })
                                              }
                                            }}
                                            className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-0.5 text-xs text-slate-500 transition-colors hover:bg-[var(--overlay)] hover:text-slate-300"
                                          >
                                            <CheckCheck className="h-3 w-3" />
                                            {allGroupAccepted ? 'Deseleziona' : 'Accetta'}
                                          </button>
                                          <ChevronDown className={cn('h-3.5 w-3.5 text-slate-600 transition-transform', collapsedCorrGroups.has(type) && '-rotate-90')} />
                                        </button>
                                        {!collapsedCorrGroups.has(type) && (
                                          <div className="divide-y divide-[var(--border)]">
                                            {[...items].sort(({i: a}, {i: b}) => {
                                              const rankOf = (idx: number) => {
                                                if (acceptedCorrections.has(idx) || rejectedCorrections.has(idx)) return 1
                                                const wa = analysis.acceptedCorrections?.includes(idx)
                                                const wr = analysis.rejectedCorrections?.includes(idx)
                                                if (wa) return 2
                                                if (wr) return 3
                                                return 0
                                              }
                                              return rankOf(a) - rankOf(b)
                                            }).map(({c, i}) => {
                                              const isAccepted = acceptedCorrections.has(i)
                                              const isRejected = rejectedCorrections.has(i)
                                              const wasAccepted = analysis.acceptedCorrections?.includes(i)
                                              const wasRejected = analysis.rejectedCorrections?.includes(i)
                                              return (
                                                <div
                                                  key={i}
                                                  onClick={() => { toggleAccept(i); setActiveInlineCorrection(i) }}
                                                  className={cn(
                                                    'cursor-pointer p-3 space-y-2 transition-colors',
                                                    isAccepted ? 'bg-emerald-950/70 border-l-4 border-emerald-500/80'
                                                      : isRejected ? 'bg-red-950/10 opacity-60'
                                                      : activeInlineCorrection === i ? 'bg-violet-900/20'
                                                      : wasAccepted ? 'bg-emerald-900/5'
                                                      : wasRejected ? 'bg-slate-900/10 opacity-50'
                                                      : 'hover:bg-[var(--overlay)]'
                                                  )}
                                                >
                                                  <div className="flex items-center gap-2">
                                                    <div onClick={(e) => { e.stopPropagation(); toggleAccept(i) }} className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors', isAccepted ? 'border-emerald-500 bg-emerald-600' : 'border-[var(--border-strong)] bg-transparent hover:border-emerald-600')}>
                                                      {isAccepted && <CheckCheck className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                                                    </div>
                                                    <div onClick={(e) => { e.stopPropagation(); toggleReject(i) }} className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors', isRejected ? 'border-red-500 bg-red-600' : 'border-[var(--border-strong)] bg-transparent hover:border-red-600')}>
                                                      {isRejected && <X className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                                                    </div>
                                                    {isAccepted && <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-900/40 border border-emerald-700/50 px-2 py-0.5 text-xs font-medium text-emerald-400"><CheckCheck className="h-3 w-3" />da applicare</span>}
                                                    {isRejected && <span className="ml-auto flex items-center gap-1 rounded-full bg-red-900/30 border border-red-800/40 px-2 py-0.5 text-xs text-red-400"><X className="h-3 w-3" />rifiutata</span>}
                                                    {!isAccepted && !isRejected && wasAccepted && <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-900/30 border border-emerald-800/30 px-2 py-0.5 text-xs text-emerald-600"><CheckCheck className="h-3 w-3" />già accettata</span>}
                                                    {!isAccepted && !isRejected && wasRejected && <span className="ml-auto flex items-center gap-1 rounded-full bg-slate-800/40 border border-slate-700/30 px-2 py-0.5 text-xs text-slate-600"><X className="h-3 w-3" />già rifiutata</span>}
                                                    {!isAccepted && !isRejected && !wasAccepted && !wasRejected && <span className="ml-auto text-xs text-slate-700 italic">da rivedere</span>}
                                                  </div>
                                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                                    <div>
                                                      <p className="mb-1 text-slate-600">Originale</p>
                                                      <p className="rounded-lg bg-red-950/20 p-2 text-slate-400 line-through leading-relaxed">{c.original}</p>
                                                    </div>
                                                    <div>
                                                      <p className="mb-1 text-slate-600">Suggerito</p>
                                                      <p className="rounded-lg bg-emerald-950/20 p-2 text-emerald-300 leading-relaxed">{c.suggested}</p>
                                                    </div>
                                                  </div>
                                                  {c.note && <p className="text-xs text-slate-600 italic">{c.note}</p>}
                                                </div>
                                              )
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })
                                })()}
                              </div>
                            )}
                          </motion.div>
                        )}

                        {/* ── EXTRA TAB ── */}
                        {activeTab === 'extra' && (
                          <motion.div key="extra" initial={{opacity:0,x:-4}} animate={{opacity:1,x:0}} exit={{opacity:0}} transition={{duration:0.15}} className="space-y-4">
                            {(() => {
                              const subTabs: {id: ExtraTab; label: string}[] = [
                                ...(settings.bookType === 'storico' || analysis.historicalAccuracy ? [{id: 'storico' as ExtraTab, label: 'Storico'}] : []),
                                ...(analysis.readerReactions?.length ? [{id: 'reazioni' as ExtraTab, label: 'Reazioni'}] : []),
                                ...(analysis.paragraphBreaks || reformatResult ? [{id: 'acapo' as ExtraTab, label: '¶ A Capo'}] : []),
                                ...(analysis.wordFrequency ? [{id: 'parole' as ExtraTab, label: 'Parole'}] : []),
                                ...(analysis.showDontTell ? [{id: 'showdontell' as ExtraTab, label: 'Show vs Tell'}] : []),
                                ...(analysis.verbTense ? [{id: 'verbtense' as ExtraTab, label: '⏱ Tempi'}] : []),
                                ...(customQuestions.length > 0 ? [{id: 'domande' as ExtraTab, label: `Domande (${customQuestions.length})`}] : []),
                              ]
                              if (subTabs.length === 0) return (
                                <div className="rounded-xl border border-dashed border-[var(--border)] py-8 text-center">
                                  <p className="text-sm text-slate-500">Nessuna analisi extra disponibile.</p>
                                  <p className="mt-1 text-xs text-slate-600">Attiva le opzioni nel dialog di analisi.</p>
                                </div>
                              )
                              // Auto-seleziona il primo sub-tab se quello corrente non è disponibile
                              const effectiveExtraTab = subTabs.find(t => t.id === activeExtraTab)
                                ? activeExtraTab
                                : subTabs[0].id
                              if (effectiveExtraTab !== activeExtraTab) {
                                setTimeout(() => setActiveExtraTab(effectiveExtraTab), 0)
                              }
                              return (
                                <>
                                  <div className="flex flex-wrap gap-1.5">
                                    {subTabs.map(({id, label}) => (
                                      <button
                                        key={id}
                                        onClick={() => setActiveExtraTab(id)}
                                        className={cn(
                                          'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                                          effectiveExtraTab === id
                                            ? 'border-violet-500/40 bg-violet-900/30 text-violet-300'
                                            : 'border-[var(--border)] text-slate-500 hover:text-slate-300'
                                        )}
                                      >
                                        {label}
                                      </button>
                                    ))}
                                  </div>

                                  {/* storico */}
                                  {effectiveExtraTab === 'storico' && (
                                    <div className="space-y-4">
                                      {analysis.historicalAccuracy ? (
                                        <>
                                          <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--overlay)] p-4">
                                            <div className="flex flex-col items-center gap-1">
                                              <span className={cn('text-3xl font-bold tabular-nums', analysis.historicalAccuracy.score >= 8 ? 'text-emerald-400' : analysis.historicalAccuracy.score >= 6 ? 'text-blue-400' : analysis.historicalAccuracy.score >= 4 ? 'text-amber-400' : 'text-red-400')}>{analysis.historicalAccuracy.score.toFixed(1)}</span>
                                              <span className="text-xs text-slate-600">/10</span>
                                            </div>
                                            <p className="flex-1 text-sm leading-relaxed text-slate-300">{analysis.historicalAccuracy.summary}</p>
                                          </div>
                                          {(analysis.historicalAccuracy.correct?.length ?? 0) > 0 && (
                                            <div>
                                              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-500">Accurato ({analysis.historicalAccuracy.correct.length})</p>
                                              <ul className="space-y-1.5">{(analysis.historicalAccuracy.correct ?? []).map((item, i) => (<li key={i} className="flex items-start gap-2.5 text-sm"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" /><span className="text-slate-300">{item}</span></li>))}</ul>
                                            </div>
                                          )}
                                          {(analysis.historicalAccuracy.anachronisms?.length ?? 0) > 0 && (
                                            <div>
                                              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-500">Anacronismi ({analysis.historicalAccuracy.anachronisms.length})</p>
                                              <ul className="space-y-1.5">{(analysis.historicalAccuracy.anachronisms ?? []).map((item, i) => (<li key={i} className="flex items-start gap-2.5 text-sm"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" /><span className="text-slate-300">{item}</span></li>))}</ul>
                                            </div>
                                          )}
                                          {(analysis.historicalAccuracy.issues?.length ?? 0) > 0 && (
                                            <div>
                                              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-400">Problemi ({analysis.historicalAccuracy.issues.length})</p>
                                              <div className="space-y-3">{(analysis.historicalAccuracy.issues ?? []).map((issue, i) => (<div key={i} className="rounded-xl border border-red-800/30 bg-red-900/10 p-4 space-y-2"><p className="rounded-lg bg-[var(--overlay)] px-3 py-2 text-xs text-slate-400 italic">"{issue.quote}"</p><p className="text-sm text-red-300">{issue.issue}</p><p className="flex items-start gap-1.5 text-xs text-slate-500"><span className="shrink-0 font-medium text-blue-400">Suggerimento:</span>{issue.suggestion}</p></div>))}</div>
                                            </div>
                                          )}
                                        </>
                                      ) : (
                                        <div className="rounded-xl border border-dashed border-[var(--border)] py-8 text-center"><p className="text-sm text-slate-500">Dati storici non disponibili. Rianalizza per ottenerli.</p></div>
                                      )}
                                    </div>
                                  )}

                                  {/* reazioni */}
                                  {effectiveExtraTab === 'reazioni' && (
                                    <div className="space-y-3">
                                      {analysis.readerReactions?.map((r, i) => (
                                        <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--overlay)] p-4 space-y-3">
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2"><span className="text-xl">{r.emoji}</span><span className="text-sm font-medium text-slate-300">{r.persona}</span></div>
                                            <div className="flex gap-0.5">{Array.from({length: 5}).map((_, star) => (<span key={star} className={star < r.rating ? 'text-amber-400' : 'text-slate-700'}>★</span>))}</div>
                                          </div>
                                          <p className="text-sm italic text-slate-300">"{r.reaction}"</p>
                                          <p className="text-sm leading-relaxed text-slate-400">{r.comment}</p>
                                          {(r.questions?.length ?? 0) > 0 && (
                                            <div className="rounded-lg border border-blue-800/30 bg-blue-900/10 p-3">
                                              <p className="mb-2 text-xs font-semibold text-blue-400">Domande:</p>
                                              <ul className="space-y-1">{(r.questions ?? []).map((q, qi) => (<li key={qi} className="flex items-start gap-2 text-xs text-slate-400"><span className="shrink-0 text-blue-600">?</span>{q}</li>))}</ul>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* acapo */}
                                  {effectiveExtraTab === 'acapo' && (
                                    <div className="space-y-5">
                                      {analysis?.paragraphBreaks ? (
                                        <div className="space-y-4">
                                          <div className="flex items-center gap-3">
                                            <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold', analysis.paragraphBreaks.score >= 8 ? 'bg-emerald-900/30 text-emerald-400' : analysis.paragraphBreaks.score >= 6 ? 'bg-blue-900/30 text-blue-400' : analysis.paragraphBreaks.score >= 4 ? 'bg-amber-900/30 text-amber-400' : 'bg-red-900/30 text-red-400')}>{analysis.paragraphBreaks.score.toFixed(1)}</span>
                                            <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Paragrafi</p><p className="mt-0.5 text-sm text-slate-300">{analysis.paragraphBreaks.summary}</p></div>
                                          </div>
                                          {(analysis.paragraphBreaks.issues?.length ?? 0) > 0 && (
                                            <div className="space-y-3">
                                              {(analysis.paragraphBreaks.issues ?? []).map((issue, i) => {
                                                const typeColors: Record<string, string> = {blocco_troppo_lungo:'border-orange-800/40 bg-orange-900/10 text-orange-400',assenza_pausa:'border-red-800/40 bg-red-900/10 text-red-400',pausa_prematura:'border-blue-800/40 bg-blue-900/10 text-blue-400',flusso_coscienza:'border-violet-800/40 bg-violet-900/10 text-violet-400',altro:'border-slate-700/40 bg-slate-800/20 text-slate-400'}
                                                const typeLabels: Record<string, string> = {blocco_troppo_lungo:'Blocco lungo',assenza_pausa:'Manca pausa',pausa_prematura:'Pausa prematura',flusso_coscienza:'Flusso di coscienza',altro:'Altro'}
                                                return (
                                                  <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--overlay)] p-4 space-y-2">
                                                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold border', typeColors[issue.type] ?? typeColors.altro)}>{typeLabels[issue.type] ?? issue.type}</span>
                                                    {issue.quote && <blockquote className="border-l-2 border-slate-600/50 pl-3 text-xs italic leading-relaxed text-slate-400">&ldquo;{issue.quote}&rdquo;</blockquote>}
                                                    <p className="text-sm text-slate-300">{issue.suggestion}</p>
                                                  </div>
                                                )
                                              })}
                                            </div>
                                          )}
                                          {(analysis.paragraphBreaks.issues?.length ?? 0) === 0 && (
                                            <div className="flex items-center gap-3 rounded-xl border border-emerald-700/30 bg-emerald-900/10 px-4 py-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" /><p className="text-sm text-emerald-300">Uso dei paragrafi ottimale.</p></div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center"><AlignLeft className="mx-auto mb-2 h-8 w-8 text-slate-700" /><p className="text-sm text-slate-500">Analisi paragrafi non disponibile</p></div>
                                      )}
                                      <div className="border-t border-[var(--border)]" />
                                      <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                          <div>
                                            <p className="text-sm font-semibold text-slate-300">Riformatta automaticamente</p>
                                            <p className="mt-0.5 text-xs text-slate-500">L&apos;IA aggiusta i paragrafi senza modificare le parole.</p>
                                          </div>
                                          <button onClick={() => void triggerReformat()} disabled={triggeringReformat || !!pendingReformat} className="flex shrink-0 items-center gap-2 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-600 disabled:opacity-40">
                                            {triggeringReformat || pendingReformat ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlignLeft className="h-3.5 w-3.5" />}
                                            {pendingReformat ? 'In corso\u2026' : 'Riformatta'}
                                          </button>
                                        </div>
                                        {reformatResult && reformatResult.chapterId === selectedId && (
                                          <motion.div initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} className="rounded-xl border border-teal-700/40 bg-teal-900/10 p-4 space-y-3">
                                            <div className="flex items-start justify-between gap-3">
                                              <div>
                                                <p className="text-sm font-semibold text-teal-300">Riformattazione pronta{reformatResult.paragraphsChanged > 0 && <span className="ml-1 text-xs font-normal text-slate-400">· {reformatResult.paragraphsChanged} paragrafi</span>}</p>
                                                <p className="mt-0.5 text-xs text-slate-400">{reformatResult.changesSummary}</p>
                                              </div>
                                              <button onClick={async () => { await deleteParagraphReformat(selectedId); setReformatResult(null) }} className="rounded p-1 text-slate-600 hover:text-slate-300 transition-colors"><X className="h-4 w-4" /></button>
                                            </div>
                                            <div className="max-h-32 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--overlay)] p-3 text-xs leading-relaxed text-slate-400 whitespace-pre-wrap">{reformatResult.reformattedText.slice(0, 400)}{reformatResult.reformattedText.length > 400 && '\u2026'}</div>
                                            <button onClick={() => void handleApplyReformat()} disabled={isApplyingReformat} className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-500 disabled:opacity-40">
                                              {isApplyingReformat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                              Applica e salva
                                            </button>
                                          </motion.div>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* parole */}
                                  {effectiveExtraTab === 'parole' && analysis?.wordFrequency && (() => {
                                    const wf = analysis.wordFrequency
                                    const total = wf.totalWords || 1
                                    const chartWords = wf.topWords.slice(0, 20)
                                    const repScore = wf.repetitionScore
                                    const repColor = repScore >= 60 ? 'text-red-400 bg-red-900/20 border-red-700/30' : repScore >= 35 ? 'text-amber-400 bg-amber-900/20 border-amber-700/30' : 'text-emerald-400 bg-emerald-900/20 border-emerald-700/30'
                                    const repLabel = repScore >= 60 ? 'Alta ripetitivit\u00e0' : repScore >= 35 ? 'Media' : 'Bassa'
                                    return (
                                      <div className="space-y-4">
                                        <div className="grid grid-cols-3 gap-3">
                                          <div className="rounded-xl border border-[var(--border)] bg-[var(--overlay)] p-3 text-center"><p className="text-xl font-bold text-slate-200">{wf.totalWords.toLocaleString('it-IT')}</p><p className="mt-0.5 text-xs text-slate-500">Parole</p></div>
                                          <div className="rounded-xl border border-[var(--border)] bg-[var(--overlay)] p-3 text-center"><p className="text-xl font-bold text-slate-200">{wf.uniqueWords.toLocaleString('it-IT')}</p><p className="mt-0.5 text-xs text-slate-500">Uniche</p></div>
                                          <div className={`rounded-xl border p-3 text-center ${repColor}`}><p className="text-xl font-bold">{repScore}</p><p className="mt-0.5 text-xs opacity-80">{repLabel}</p></div>
                                        </div>
                                        <div className="rounded-xl border border-[var(--border)] bg-[var(--overlay)] p-4">
                                          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Top 20 parole</p>
                                          <ResponsiveContainer width="100%" height={200}>
                                            <BarChart data={chartWords} margin={{top:0,right:0,left:-20,bottom:55}}>
                                              <XAxis dataKey="word" tick={{fill:'#94a3b8',fontSize:10}} angle={-45} textAnchor="end" interval={0} />
                                              <YAxis tick={{fill:'#64748b',fontSize:10}} />
                                              <Tooltip contentStyle={{background:'var(--bg-elevated)',border:'1px solid var(--border)',borderRadius:8,fontSize:12}} formatter={(v: unknown) => [v as number,'occorrenze']} />
                                              <Bar dataKey="count" radius={[4,4,0,0]}>{chartWords.map((entry, i) => { const pct=(entry.count/total)*100; return <Cell key={i} fill={pct>=2?'#f87171':pct>=1?'#fb923c':'#818cf8'} /> })}</Bar>
                                            </BarChart>
                                          </ResponsiveContainer>
                                        </div>
                                        <div className="rounded-xl border border-[var(--border)] bg-[var(--overlay)] overflow-hidden">
                                          <table className="w-full text-sm">
                                            <thead><tr className="border-b border-[var(--border)]"><th className="px-3 py-2 text-left text-xs text-slate-500">#</th><th className="px-3 py-2 text-left text-xs text-slate-500">Parola</th><th className="px-3 py-2 text-right text-xs text-slate-500">N</th><th className="px-3 py-2 text-right text-xs text-slate-500">%</th></tr></thead>
                                            <tbody>{wf.topWords.map((entry, i) => { const pct=(entry.count/total)*100; const tc=pct>=2?'text-red-300':pct>=1?'text-amber-300':'text-slate-300'; return (<tr key={entry.word} className="border-b border-[var(--border)]/50"><td className="px-3 py-1.5 text-xs text-slate-600">{i+1}</td><td className={`px-3 py-1.5 font-medium ${tc}`}>{entry.word}</td><td className="px-3 py-1.5 text-right text-xs text-slate-400">{entry.count}</td><td className="px-3 py-1.5 text-right text-xs text-slate-500">{pct.toFixed(1)}%</td></tr>) })}</tbody>
                                          </table>
                                        </div>
                                      </div>
                                    )
                                  })()}

                                  {/* showdontell */}
                                  {effectiveExtraTab === 'showdontell' && analysis?.showDontTell && (
                                    <div className="space-y-4">
                                      <div className="flex items-center gap-3">
                                        <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold', analysis.showDontTell.score >= 8 ? 'bg-emerald-900/30 text-emerald-400' : analysis.showDontTell.score >= 6 ? 'bg-blue-900/30 text-blue-400' : analysis.showDontTell.score >= 4 ? 'bg-amber-900/30 text-amber-400' : 'bg-red-900/30 text-red-400')}>{analysis.showDontTell.score.toFixed(1)}</span>
                                        <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Show vs Tell</p><p className="mt-0.5 text-sm text-slate-300">{analysis.showDontTell.summary}</p></div>
                                      </div>
                                      <div className="rounded-lg border border-orange-800/30 bg-orange-900/10 px-3 py-2 text-xs text-orange-300 leading-relaxed">
                                        <strong>Show, don&apos;t tell:</strong> mostra emozioni attraverso azioni invece di descriverle direttamente. <span className="line-through opacity-50">&laquo;Era triste&raquo;</span> &rarr; <span className="text-emerald-300">&laquo;Le lacrime le rigarono le guance&raquo;</span>
                                      </div>
                                      {(analysis.showDontTell.issues?.length ?? 0) > 0 ? (
                                        <div className="space-y-4">
                                          {(analysis.showDontTell.issues ?? []).map((issue, i) => (
                                            <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--overlay)] p-4 space-y-3">
                                              <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-800/40 bg-orange-900/20 px-2.5 py-0.5 text-xs font-semibold text-orange-400">Telling</span>
                                              <blockquote className="border-l-2 border-orange-500/40 pl-3 text-sm italic leading-relaxed text-slate-300">&ldquo;{issue.quote}&rdquo;</blockquote>
                                              <p className="text-xs leading-relaxed text-slate-500">{issue.explanation}</p>
                                              <div className="rounded-lg border border-emerald-800/40 bg-emerald-900/10 p-3 space-y-1.5">
                                                <p className="text-xs font-semibold text-emerald-400">Riscrittura proposta (Show)</p>
                                                <p className="text-sm leading-relaxed text-slate-200">{issue.rewrite}</p>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-3 rounded-xl border border-emerald-700/30 bg-emerald-900/10 px-4 py-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" /><p className="text-sm text-emerald-300">Eccellente uso dello showing.</p></div>
                                      )}
                                    </div>
                                  )}

                                  {/* verbtense */}
                                  {effectiveExtraTab === 'verbtense' && analysis?.verbTense && (
                                    <div className="space-y-4">
                                      <div className="flex items-center gap-3">
                                        <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold', analysis.verbTense.score >= 8 ? 'bg-emerald-900/30 text-emerald-400' : analysis.verbTense.score >= 6 ? 'bg-blue-900/30 text-blue-400' : analysis.verbTense.score >= 4 ? 'bg-amber-900/30 text-amber-400' : 'bg-red-900/30 text-red-400')}>{analysis.verbTense.score.toFixed(1)}</span>
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Coerenza tempi verbali</p>
                                          <p className="mt-0.5 text-sm text-slate-300">{analysis.verbTense.summary}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 rounded-lg border border-purple-800/30 bg-purple-900/10 px-3 py-2">
                                        <span className="text-xs font-semibold text-purple-400">Tempo dominante:</span>
                                        <span className="rounded-full border border-purple-700/40 bg-purple-900/20 px-2.5 py-0.5 text-xs font-medium text-purple-300">{analysis.verbTense.dominantTense}</span>
                                      </div>
                                      {(() => {
                                        const vtCorrections = (analysis.corrections ?? []).filter((c) => c.type === 'verb_tense')
                                        return vtCorrections.length > 0 ? (
                                          <div className="rounded-lg border border-purple-800/30 bg-purple-900/10 px-3 py-2 text-xs text-purple-300 leading-relaxed">
                                            <strong>{vtCorrections.length} {vtCorrections.length === 1 ? 'problema' : 'problemi'} trovati</strong> — vedi la tab <strong>Correzioni</strong> per accettarli e applicarli direttamente al testo.
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-3 rounded-xl border border-emerald-700/30 bg-emerald-900/10 px-4 py-3">
                                            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                                            <p className="text-sm text-emerald-300">Tempi verbali coerenti. Nessun problema rilevato.</p>
                                          </div>
                                        )
                                      })()}
                                    </div>
                                  )}

                                  {/* domande personalizzate */}
                                  {effectiveExtraTab === 'domande' && (
                                    <div className="space-y-3">
                                      {customQuestions.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-[var(--border)] py-8 text-center">
                                          <p className="text-sm text-slate-500">Nessuna domanda personalizzata ancora.</p>
                                          <p className="mt-1 text-xs text-slate-600">Usa il dialog di analisi per inviarne una.</p>
                                        </div>
                                      ) : (
                                        customQuestions.map((q) => (
                                          <div key={q.id} className="rounded-xl border border-[var(--border)] bg-[var(--overlay)] overflow-hidden">
                                            <button
                                              onClick={() => setExpandedQuestionId(expandedQuestionId === q.id ? null : (q.id ?? null))}
                                              className="w-full flex items-start gap-3 p-4 text-left hover:bg-white/5 transition-colors"
                                            >
                                              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-violet-500/40 bg-violet-900/30 text-xs font-bold text-violet-400">?</span>
                                              <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-200 leading-snug">{q.question}</p>
                                                <p className="mt-0.5 text-xs text-slate-600">{formatRelativeDate(q.analyzedAt)} &middot; {q.provider} &middot; {q.model}</p>
                                              </div>
                                              <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform mt-0.5', expandedQuestionId === q.id && 'rotate-180')} />
                                            </button>

                                            {expandedQuestionId === q.id && (
                                              <div className="border-t border-[var(--border)] p-4 space-y-4">
                                                <div className="rounded-lg border border-violet-800/30 bg-violet-900/10 p-4">
                                                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-violet-400">Risposta</p>
                                                  <p className="text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">{q.answer}</p>
                                                </div>
                                                {q.findings.length > 0 && (
                                                  <div className="space-y-2.5">
                                                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Osservazioni ({q.findings.length})</p>
                                                    {q.findings.map((f, i) => (
                                                      <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 space-y-2">
                                                        {f.quote && (
                                                          <blockquote className="border-l-2 border-slate-600 pl-3 text-xs italic leading-relaxed text-slate-400">&ldquo;{f.quote}&rdquo;</blockquote>
                                                        )}
                                                        <p className="text-sm text-slate-300">{f.observation}</p>
                                                        {f.suggestion && (
                                                          <div className="rounded-md border border-emerald-800/30 bg-emerald-900/10 px-3 py-2">
                                                            <p className="text-xs font-medium text-emerald-400 mb-0.5">Suggerimento</p>
                                                            <p className="text-xs leading-relaxed text-slate-300">{f.suggestion}</p>
                                                          </div>
                                                        )}
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                                {q.corrections.length > 0 && (
                                                  <div className="space-y-2">
                                                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Correzioni ({q.corrections.length})</p>
                                                    {q.corrections.map((c, i) => (
                                                      <div key={i} className={cn('rounded-lg border p-3 space-y-1.5 text-xs', CORRECTION_TYPE_COLORS[c.type] ?? 'border-slate-700/30 bg-slate-800/30 text-slate-400')}>
                                                        <span className="font-semibold">{CORRECTION_TYPE_LABELS[c.type] ?? c.type}</span>
                                                        <p className="line-through text-slate-500">{c.original}</p>
                                                        <p className="font-medium text-slate-200">{c.suggested}</p>
                                                        <p className="text-slate-500">{c.note}</p>
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  )}
                                </>
                              )
                            })()}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                  {/* end LEFT panel */}

                  {/* \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 RIGHT: Editor (sticky) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
                  <div className="sticky top-4 flex flex-col gap-3" style={{height: 'calc(100vh - 160px)'}}>
                    {/* Drive actions bar */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-slate-600 truncate">
                          {selectedChapter?.lastSyncAt ? `Aggiornato ${formatRelativeDate(selectedChapter.lastSyncAt)}` : 'Nessuna sincronizzazione'}
                        </span>
                        {isDirty && (
                          <span className="flex shrink-0 items-center gap-1 text-xs text-amber-500">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />non salvato
                          </span>
                        )}
                        {!isDirty && !!editorContent && (
                          <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-600">
                            <CheckCheck className="h-3 w-3" /> salvato
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {selectedChapter?.driveFileId && driveConfig?.folderId && (
                          <button onClick={() => void handleReloadFromDrive()} disabled={isForceSyncingDrive} className="flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-300 disabled:opacity-50">
                            <RefreshCw className={cn('h-3 w-3', isForceSyncingDrive && 'animate-spin')} /> Ricarica
                          </button>
                        )}
                        {driveConfig?.folderId && (
                          <button
                            onClick={() => void handlePushToDrive()}
                            disabled={isPushingToDrive || !editorContent || !isPendingPush}
                            className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-40', isPendingPush ? 'bg-amber-600 hover:bg-amber-500' : 'bg-slate-700 hover:bg-slate-600')}
                          >
                            {isPushingToDrive ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileEdit className="h-3 w-3" />}
                            Salva su Drive{isPendingPush ? ' *' : ''}
                          </button>
                        )}
                        {!driveConfig?.folderId && (
                          <button onClick={() => void handleSaveEditorContent()} disabled={isSavingContent || !editorContent || !isDirty} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-40">
                            {isSavingContent ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileEdit className="h-3 w-3" />}
                            Salva{isDirty ? ' *' : ''}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Applied changes summary */}
                    {appliedChanges.length > 0 && (
                      <div className="shrink-0 flex items-center gap-3 rounded-xl border border-emerald-800/30 bg-emerald-900/10 px-4 py-2.5">
                        <CheckCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        <p className="flex-1 text-xs text-emerald-400">{appliedChanges.length} correzioni applicate \u2014 salva su Drive per confermare</p>
                        <button onClick={() => setAppliedChanges([])} className="text-slate-600 hover:text-slate-400"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    )}

                    {!selectedChapter?.driveContent && !editorContent && (
                      <p className="shrink-0 text-xs text-amber-400 rounded-lg border border-amber-800/30 bg-amber-900/10 px-3 py-2">
                        Nessun testo sincronizzato da Drive. Sincronizza il capitolo nelle Impostazioni.
                      </p>
                    )}

                    {/* Rich Text Editor with inline corrections */}
                    <RichTextEditor
                      content={editorContent}
                      onChange={(html) => { setEditorContent(html); setAppliedChanges([]) }}
                      className="flex-1 min-h-0"
                      placeholder="Il testo del capitolo apparir\u00e0 qui dopo la sincronizzazione Drive..."
                      isFullscreen={editorFullscreen}
                      onToggleFullscreen={() => setEditorFullscreen((f) => !f)}
                      inlineCorrections={inlineCorrections}
                      acceptedCorrections={acceptedCorrections}
                      rejectedCorrections={rejectedCorrections}
                      focusedCorrection={activeInlineCorrection}
                      onAcceptInline={handleAcceptInline}
                      onRejectInline={toggleReject}
                      externalSearchQuery={editorSearchQuery}
                    />
                  </div>
                  {/* end RIGHT panel */}
                </div>
                {/* end split-pane grid */}
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
            <h2 className="flex-1 text-xs font-semibold uppercase tracking-wider text-red-400">
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
                  <button
                    onClick={() => void removeError(err.chapterId, err.provider)}
                    className="ml-auto shrink-0 rounded p-0.5 text-slate-600 transition-colors hover:bg-red-900/40 hover:text-red-400"
                    title="Rimuovi errore"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
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
                                return (
                                  <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                      <TrendingUp className="h-4 w-4 text-violet-400" />
                                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                        Storico analisi
                                      </h3>
                                      <div className="ml-auto flex items-center gap-3">
                                        {providerEntries.map(([prov]) => {
                                          const pcfg = AI_PROVIDER_CONFIG[prov]
                                          return (
                                            <button
                                              key={prov}
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                setSelectedId(c.id)
                                                setActiveProvider(prov)
                                                setActiveTab('feedback')
                                                window.scrollTo({top: 0, behavior: 'smooth'})
                                              }}
                                              className="text-xs text-violet-400 hover:text-violet-300"
                                            >
                                              Vai all'analisi {pcfg.label} ↑
                                            </button>
                                          )
                                        })}
                                      </div>
                                    </div>
                                    {!hasHistory && (
                                      <div className="py-2 text-center">
                                        <p className="text-xs text-slate-500">Solo un'analisi disponibile — avvia un'altra analisi per vedere il trend.</p>
                                      </div>
                                    )}
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
                                                        <div className="flex items-center justify-center gap-1">
                                                          <button
                                                            onClick={(e) => {
                                                              e.stopPropagation()
                                                              setHistoryDetailModal({entry, chapterTitle: c.title, provider})
                                                            }}
                                                            title="Visualizza analisi completa"
                                                            className="rounded p-0.5 text-slate-500 transition-colors hover:text-violet-400"
                                                          >
                                                            <Eye className="h-3.5 w-3.5" />
                                                          </button>
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
                                                        </div>
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

      {/* Modale dettaglio voce storico */}
      <AnimatePresence>
        {historyDetailModal && (() => {
          const {entry, chapterTitle, provider: hp} = historyDetailModal
          const cfg = AI_PROVIDER_CONFIG[hp]
          return (
            <>
              <motion.div
                initial={{opacity: 0}}
                animate={{opacity: 1}}
                exit={{opacity: 0}}
                onClick={() => setHistoryDetailModal(null)}
                className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
              />
              <motion.div
                initial={{opacity: 0, scale: 0.92, y: 20}}
                animate={{opacity: 1, scale: 1, y: 0}}
                exit={{opacity: 0, scale: 0.92}}
                transition={{duration: 0.18}}
                className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 max-h-[88vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl"
              >
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-2xl border-b border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-xs font-semibold', cfg.color)}>
                        {cfg.icon} {cfg.label}
                      </span>
                      <span className="text-xs text-slate-600">&middot; {entry.model}</span>
                    </div>
                    <h2 className="mt-0.5 truncate text-base font-semibold text-[var(--text-primary)]">{chapterTitle}</h2>
                    <p className="text-xs text-slate-500">
                      {new Date(entry.analyzedAt).toLocaleDateString('it-IT', {day: '2-digit', month: 'long', year: 'numeric'})}
                      {' '}
                      {new Date(entry.analyzedAt).toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})}
                    </p>
                  </div>
                  <button
                    onClick={() => setHistoryDetailModal(null)}
                    className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-[var(--overlay)] hover:text-slate-200"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-5 p-6">
                  {/* Scores grid */}
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {[...Object.entries(SCORE_LABELS), ['overall', 'Overall'] as [string, string]].map(([key, label]) => {
                      const val = entry.scores[key as keyof typeof entry.scores] as number
                      return (
                        <div key={key} className={cn(
                          'rounded-xl border p-2.5 text-center',
                          key === 'overall' ? 'border-violet-700/40 bg-violet-900/15' : 'border-[var(--border)] bg-[var(--overlay)]'
                        )}>
                          <p className={cn('text-lg font-bold', getScoreColor(val))}>{val.toFixed(1)}</p>
                          <p className="mt-0.5 text-[10px] text-slate-500 leading-tight">{label}</p>
                        </div>
                      )
                    })}
                  </div>

                  {/* Summary */}
                  {entry.summary && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--overlay)] p-4">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Sintesi</p>
                      <p className="text-sm leading-relaxed text-slate-300">{entry.summary}</p>
                    </div>
                  )}

                  {/* Strengths */}
                  {entry.strengths?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-500">Punti di forza</p>
                      {entry.strengths.map((s, i) => (
                        <div key={i} className="flex gap-2 rounded-lg border border-emerald-800/20 bg-emerald-900/10 px-3 py-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                          <p className="text-sm text-slate-300">{s}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Weaknesses */}
                  {entry.weaknesses?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-500">Debolezze</p>
                      {entry.weaknesses.map((w, i) => {
                        const isObj = typeof w === 'object' && w !== null
                        const text = isObj ? (w as {text: string}).text : w as string
                        const quotes = isObj ? (w as {quotes?: string[]}).quotes ?? [] : []
                        const solution = isObj ? (w as {solution?: string}).solution : undefined
                        return (
                          <div key={i} className="rounded-lg border border-amber-800/20 bg-amber-900/10 px-3 py-2 space-y-1">
                            <p className="text-sm text-slate-300">{text}</p>
                            {quotes.map((q, qi) => (
                              <blockquote key={qi} className="border-l-2 border-amber-700/40 pl-2 text-xs italic text-slate-500">&ldquo;{q}&rdquo;</blockquote>
                            ))}
                            {solution && <p className="text-xs text-amber-300 mt-1">💡 {solution}</p>}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Suggestions */}
                  {entry.suggestions?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-violet-400">Suggerimenti</p>
                      {entry.suggestions.map((s, i) => {
                        const isObj = typeof s === 'object' && s !== null
                        const text = isObj ? (s as {text: string}).text : s as string
                        const solution = isObj ? (s as {solution?: string}).solution : undefined
                        return (
                          <div key={i} className="rounded-lg border border-violet-800/20 bg-violet-900/10 px-3 py-2 space-y-1">
                            <p className="text-sm text-slate-300">{text}</p>
                            {solution && <p className="text-xs text-violet-300 mt-1">💡 {solution}</p>}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Corrections */}
                  {entry.corrections?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Correzioni ({entry.corrections.length})</p>
                      {entry.corrections.map((c, i) => (
                        <div key={i} className={cn('rounded-lg border px-3 py-2 text-xs space-y-1', CORRECTION_TYPE_COLORS[c.type] ?? CORRECTION_TYPE_COLORS.style)}>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold">{CORRECTION_TYPE_LABELS[c.type] ?? c.type}</span>
                            <span className="text-slate-600">&middot;</span>
                            <span className="text-slate-500">{c.note}</span>
                          </div>
                          <p className="line-through opacity-60">{c.original}</p>
                          <p className="font-medium">{c.suggested}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reader reactions */}
                  {(entry.readerReactions?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-sky-400">Reazioni Lettori</p>
                      {(entry.readerReactions ?? []).map((r, i) => (
                        <div key={i} className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-3 py-2">
                          <span className="text-xl leading-none">{r.emoji}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-300">{r.persona}</p>
                            <p className="mt-0.5 text-xs text-slate-500">{r.reaction}</p>
                          </div>
                          <span className={cn('ml-auto shrink-0 text-sm font-bold', getScoreColor(r.rating * 2))}>{r.rating}/5</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Note autore */}
                  {entry.authorComment && (
                    <div className="rounded-xl border border-slate-700/30 bg-slate-800/20 px-4 py-3">
                      <p className="mb-1 text-xs font-semibold text-slate-500">Nota autore inviata</p>
                      <p className="text-xs italic text-slate-400">&ldquo;{entry.authorComment}&rdquo;</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </>
          )
        })()}
      </AnimatePresence>

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
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl max-h-[90vh] flex flex-col"
            >
              <div className="overflow-y-auto flex-1 p-6">
                <div className="mb-4 flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-900/40 text-violet-400">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-[var(--text-primary)]">Rieseguire l&apos;analisi?</h3>
                    <p className="mt-1 text-sm text-slate-400">{reanalysisDialog.label}</p>
                  </div>
                </div>

                <p className="mb-3 text-sm text-slate-500">
                  Sovrascriverà i risultati {AI_PROVIDER_CONFIG[reanalysisDialog.provider].label} esistenti e consumerà token.
                </p>

                {/* Nota per l'IA */}
                <div className="mb-3">
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                    <FileEdit className="h-3.5 w-3.5" />
                    Nota per l&apos;IA
                    <span className="text-slate-600">(opzionale)</span>
                  </label>
                  <textarea
                    value={reanalysisComment}
                    onChange={(e) => setReanalysisComment(e.target.value)}
                    placeholder="Es: ho riscritto il dialogo del terzo atto, concentrati sulla coerenza dei personaggi…"
                    rows={2}
                    className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 outline-none focus:border-violet-500/40"
                  />
                  {reanalysisComment.trim() && (
                    <p className="mt-1 text-xs text-slate-600">Verrà salvato e riutilizzato alla prossima analisi.</p>
                  )}
                </div>

                {renderSezioniPicker()}

                <div className="mt-4 space-y-2">
                  <button
                    onClick={() => void triggerAnalysis(reanalysisDialog.chapterId, true, reanalysisDialog.provider, reanalysisComment)}
                    disabled={triggering}
                    className="flex w-full items-start gap-3 rounded-xl border border-violet-700/40 bg-violet-900/15 p-3 text-left transition-colors hover:border-violet-600/60 hover:bg-violet-900/25"
                  >
                    <History className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                    <div>
                      <p className="text-sm font-medium text-violet-300">Con contesto precedente</p>
                      <p className="mt-0.5 text-xs text-slate-500">Invia l&apos;analisi passata per valutare il progresso e non ripetere correzioni già applicate.</p>
                    </div>
                  </button>
                  <button
                    onClick={() => void triggerAnalysis(reanalysisDialog.chapterId, false, reanalysisDialog.provider, reanalysisComment)}
                    disabled={triggering}
                    className="flex w-full items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--overlay)] p-3 text-left transition-colors hover:border-[var(--border-strong)] hover:bg-white/[0.07]"
                  >
                    <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <div>
                      <p className="text-sm font-medium text-slate-300">Analisi da zero</p>
                      <p className="mt-0.5 text-xs text-slate-500">Analisi fresca, senza contesto precedente. Utile se il capitolo è stato riscritto.</p>
                    </div>
                  </button>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => setReanalysisDialog(null)}
                    className="rounded-lg px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-[var(--overlay)] hover:text-slate-200"
                  >
                    Annulla
                  </button>
                </div>
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
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl max-h-[90vh] flex flex-col"
            >
              <div className="overflow-y-auto flex-1 p-6">
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

              {/* Domanda personalizzata */}
              <div className="mb-4">
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-violet-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  Domanda precisa
                  <span className="text-slate-600">(opzionale)</span>
                </label>
                <textarea
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder="Es: il dialogo tra Marco e Sofia è credibile? Come migliorare il ritmo nella scena del bosco?"
                  rows={3}
                  autoFocus
                  className="w-full resize-none rounded-lg border border-violet-700/40 bg-[var(--overlay)] px-3 py-2.5 text-sm text-slate-300 placeholder:text-slate-600 outline-none focus:border-violet-500/60"
                />
                {customQuestion.trim() ? (
                  <p className="mt-1.5 text-xs text-violet-500">
                    Modalità domanda: l&apos;IA risponderà solo a questa domanda con osservazioni mirate e correzioni. Le sezioni standard vengono ignorate.
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-slate-600">
                    Se compili questo campo, l&apos;analisi sarà mirata alla tua domanda specifica invece che standard.
                  </p>
                )}
              </div>

              {/* Commento autore (solo in modalità standard) */}
              {!customQuestion.trim() && (
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
                  rows={3}
                  className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-3 py-2.5 text-sm text-slate-300 placeholder:text-slate-600 outline-none focus:border-violet-500/40"
                />
                <p className="mt-1.5 text-xs text-slate-600">
                  {authorComment.trim()
                    ? 'Questo testo sarà salvato e riutilizzato alla prossima analisi di questo capitolo.'
                    : 'Contestualizza l\'analisi. Il testo viene salvato per capitolo.'}
                </p>
              </div>
              )}

              {/* Sezioni da analizzare (solo in modalità standard) */}
              {customQuestion.trim() && (
                <div className="mb-5 rounded-xl border border-violet-800/30 bg-violet-900/10 p-4">
                  <p className="text-sm text-violet-300">L&apos;IA si concentrerà esclusivamente sulla tua domanda e restituirà: risposta dettagliata, osservazioni citate dal testo, e correzioni specifiche.</p>
                </div>
              )}
              {!customQuestion.trim() && <div className="mb-4">{renderSezioniPicker()}</div>}

              <div className="flex gap-3">
                <button
                  onClick={() => setAnalyzeDialog(null)}
                  className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-[var(--overlay)]"
                >
                  Annulla
                </button>
                <button
                  onClick={() => void triggerAnalysis(analyzeDialog.chapterId, false, analyzeDialog.provider, authorComment, customQuestion.trim() || undefined)}
                  disabled={triggering}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
                >
                  {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : customQuestion.trim() ? <Sparkles className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {customQuestion.trim() ? 'Invia domanda' : 'Avvia analisi'}
                </button>
              </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
