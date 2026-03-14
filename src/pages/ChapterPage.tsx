import {useEffect, useRef, useState} from 'react'
import {Link, useParams} from 'react-router-dom'
import {motion} from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckSquare,
  ChevronLeft,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  PenLine,
  RefreshCw,
  Sparkles,
  Tag,
  Target,
} from 'lucide-react'
import {useChaptersStore} from '@/stores/chaptersStore'
import {useSettingsStore} from '@/stores/settingsStore'
import {useAnalysisStore} from '@/stores/analysisStore'
import {useUIStore} from '@/stores/uiStore'
import {useDriveStore} from '@/stores/driveStore'
import {useAuthStore} from '@/stores/authStore'
import {toast} from '@/stores/toastStore'
import type {Chapter, ChecklistItem} from '@/types'
import {ChapterStatus, PRIORITY_CONFIG, STATUS_CONFIG, SyncSource, SyncStatus} from '@/types'
import {getValidAccessToken} from '@/services/driveAuthService'
import {getDriveFileContent} from '@/services/driveFileService'
import {calcProgress, charsToPages, formatDate, formatNumber, formatRelativeDate, wordsToReadingTime,} from '@/utils/formatters'
import {useDebounce} from '@/hooks/useDebounce'
import {cn} from '@/utils/cn'
import ChecklistEditor from '@/components/chapters/ChecklistEditor'

const inputCls =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-slate-600 focus:border-violet-500/40 focus:outline-none transition-colors'

export default function ChapterPage() {
  const { id } = useParams<{ id: string }>()
  const { chapters, updateChapter, isSaving } = useChaptersStore()
  const { settings } = useSettingsStore()
  const { getAnyAnalysis, loadAnalysis } = useAnalysisStore()
  const { setLastSaved } = useUIStore()
  const { config: driveConfig, patchTokens } = useDriveStore()
  const { user } = useAuthStore()

  const chapter = chapters.find((c) => c.id === id)
  const sorted = [...chapters].sort((a, b) => a.number - b.number)
  const sortedIdx = sorted.findIndex((c) => c.id === id)
  const prevChapter = sorted[sortedIdx - 1]
  const nextChapter = sorted[sortedIdx + 1]

  // Local editable state
  const [title, setTitle] = useState('')
  const [synopsis, setSynopsis] = useState('')
  const [notes, setNotes] = useState('')
  const [currentChars, setCurrentChars] = useState(0)
  const [wordCount, setWordCount] = useState(0)
  const [status, setStatus] = useState<ChapterStatus>(ChapterStatus.TODO)
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [editingTitle, setEditingTitle] = useState(false)
  const [isForceSyncing, setIsForceSyncing] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  // Populate from chapter
  useEffect(() => {
    if (chapter) {
      setTitle(chapter.title)
      setSynopsis(chapter.synopsis)
      setNotes(chapter.notes)
      setCurrentChars(chapter.currentChars)
      setWordCount(chapter.wordCount)
      setStatus(chapter.status)
      setChecklist(chapter.checklist)
    }
  }, [chapter?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (id) void loadAnalysis(id)
  }, [id, loadAnalysis])

  const analysis = id ? getAnyAnalysis(id) : null

  // ── Debounced saves ───────────────────────────────────────────────────────

  const debouncedSaveText = useDebounce(async (updates: Partial<Chapter>) => {
    if (!id) return
    await updateChapter(id, updates)
    setLastSaved()
    toast.success('Salvato')
  }, 2000)

  const debouncedSaveStats = useDebounce(async (chars: number, words: number) => {
    if (!id) return
    await updateChapter(id, { currentChars: chars, wordCount: words })
    setLastSaved()
  }, 1500)

  async function saveStatus(newStatus: ChapterStatus) {
    if (!id) return
    setStatus(newStatus)
    await updateChapter(id, { status: newStatus })
    setLastSaved()
    toast.success(`Stato aggiornato: ${STATUS_CONFIG[newStatus].label}`)
  }

  async function saveChecklist(items: ChecklistItem[]) {
    if (!id) return
    setChecklist(items)
    await updateChapter(id, { checklist: items })
    setLastSaved()
  }

  async function handleForceSyncFromDrive() {
    if (!chapter?.driveFileId || !driveConfig || !user) return
    setIsForceSyncing(true)
    try {
      const {accessToken, updatedTokens} = await getValidAccessToken(driveConfig, user.uid)
      if (updatedTokens) await patchTokens(user.uid, updatedTokens)
      const content = await getDriveFileContent(accessToken, chapter.driveFileId, chapter.driveMimeType ?? 'text/plain')
      const words = content.split(/\s+/).filter(Boolean).length
      await updateChapter(chapter.id, {
        driveContent: content,
        currentChars: content.length,
        wordCount: words,
        syncStatus: SyncStatus.SYNCED,
        syncSource: SyncSource.DRIVE,
        lastSyncAt: new Date().toISOString(),
      })
      setCurrentChars(content.length)
      setWordCount(words)
      toast.success('Contenuto aggiornato da Drive')
    } catch (err) {
      toast.error('Errore sync: ' + (err as Error).message)
    } finally {
      setIsForceSyncing(false)
    }
  }

  async function saveTitle() {
    if (!id || !title.trim()) return
    setEditingTitle(false)
    if (title !== chapter?.title) {
      await updateChapter(id, { title: title.trim() })
      setLastSaved()
      toast.success('Titolo aggiornato')
    }
  }

  if (!chapter) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-slate-600" />
          <p className="text-sm text-slate-400">Capitolo non trovato</p>
          <Link to="/kanban" className="mt-3 text-xs text-violet-400 hover:underline">
            Torna al Kanban
          </Link>
        </div>
      </div>
    )
  }

  const pages = charsToPages(currentChars, settings.charsPerPage)
  const progress = calcProgress(currentChars, chapter.targetChars)
  const prio = PRIORITY_CONFIG[chapter.priority]
  const statusConf = STATUS_CONFIG[status]

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">

      {/* Breadcrumb */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-xs text-slate-500">
        <Link to="/kanban" className="flex items-center gap-1 hover:text-slate-300 transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" />
          Kanban
        </Link>
        <span>/</span>
        <span className="text-slate-300">Cap. {String(chapter.number).padStart(2, '0')} — {chapter.title}</span>
      </motion.div>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
        {/* Title */}
        <div className="flex items-start gap-3">
          <span className="shrink-0 rounded-lg bg-violet-900/30 px-2.5 py-1 text-xs font-mono font-semibold text-violet-400">
            {String(chapter.number).padStart(2, '0')}
          </span>
          {editingTitle ? (
            <input
              ref={titleRef}
              className="flex-1 rounded-lg border border-violet-500/40 bg-[var(--overlay)] px-3 py-1 text-xl font-bold text-[var(--text-primary)] outline-none"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
              autoFocus
            />
          ) : (
            <h1
              className="flex-1 cursor-pointer text-xl font-bold text-[var(--text-primary)] hover:text-violet-300 transition-colors"
              onClick={() => setEditingTitle(true)}
              title="Clicca per modificare"
            >
              {title}
              <Pencil className="ml-2 inline h-3.5 w-3.5 opacity-0 group-hover:opacity-100 text-slate-500" />
            </h1>
          )}
          {isSaving && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-500 mt-1" />}
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status selector */}
          <select
            value={status}
            onChange={(e) => saveStatus(e.target.value as ChapterStatus)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium cursor-pointer outline-none transition-colors',
              statusConf.bg, statusConf.color, statusConf.border
            )}
          >
            {Object.values(ChapterStatus).map((s) => (
              <option key={s} value={s} className="bg-[var(--bg-elevated)]">
                {STATUS_CONFIG[s].label}
              </option>
            ))}
          </select>

          {/* Priority */}
          <span className={cn('flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium', prio.color)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', prio.dot)} />
            {prio.label}
          </span>

          {/* Tags */}
          {chapter.tags.map((tag) => (
            <span key={tag} className="flex items-center gap-1 rounded-full bg-[var(--overlay)] px-2.5 py-1 text-xs text-slate-400">
              <Tag className="h-3 w-3" />
              {tag}
            </span>
          ))}

          {/* Due date */}
          {chapter.dueDate && (
            <span className="flex items-center gap-1 rounded-full bg-[var(--overlay)] px-2.5 py-1 text-xs text-slate-400">
              <Calendar className="h-3 w-3" />
              {formatDate(chapter.dueDate)}
            </span>
          )}

          {/* Drive actions */}
          {chapter.driveWebViewLink && (
            <a
              href={chapter.driveWebViewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-full bg-[var(--overlay)] px-2.5 py-1 text-xs text-slate-400 transition-colors hover:text-slate-200"
            >
              <ExternalLink className="h-3 w-3" />
              Drive
            </a>
          )}
          {chapter.driveFileId && driveConfig?.folderId && (
            <button
              onClick={() => void handleForceSyncFromDrive()}
              disabled={isForceSyncing}
              title="Scarica contenuto aggiornato da Drive"
              className="flex items-center gap-1 rounded-full bg-[var(--overlay)] px-2.5 py-1 text-xs text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3 w-3', isForceSyncing && 'animate-spin')} />
              {chapter.lastSyncAt
                ? `Sync ${formatRelativeDate(chapter.lastSyncAt)}`
                : 'Forza sync'}
            </button>
          )}

          {/* Open full editor */}
          <Link
            to={`/editor/${chapter.id}`}
            className="flex items-center gap-1 rounded-full bg-violet-600/20 border border-violet-500/30 px-2.5 py-1 text-xs font-medium text-violet-300 transition-colors hover:bg-violet-600/30"
            title="Apri editor completo con suggerimenti AI"
          >
            <PenLine className="h-3 w-3" />
            Apri Editor
          </Link>

          <span className="ml-auto text-xs text-slate-600">
            Aggiornato {formatRelativeDate(chapter.updatedAt)}
          </span>
        </div>
      </motion.div>

      {/* Stats strip */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {[
          { icon: FileText, label: 'Caratteri', value: formatNumber(currentChars) },
          { icon: BookOpen, label: 'Pagine stimate', value: String(pages) },
          { icon: Clock, label: 'Lettura', value: wordsToReadingTime(wordCount, settings.wordsPerMinuteReading) },
          { icon: Target, label: 'Progresso', value: `${progress}%` },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </div>
            <p className="text-xl font-bold text-[var(--text-primary)]">{value}</p>
          </div>
        ))}
      </motion.div>

      {/* Progress bar */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <div className="flex justify-between text-xs text-slate-500 mb-2">
          <span>Caratteri scritti</span>
          <span>{progress}% di {formatNumber(chapter.targetChars)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--overlay)]">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-violet-600 to-cyan-500"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ delay: 0.3, duration: 0.8, ease: 'easeOut' }}
          />
        </div>
        {/* Editable stats */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-600">Caratteri scritti</label>
            <input
              type="number"
              className={inputCls}
              value={currentChars}
              onChange={(e) => {
                const v = Number(e.target.value)
                setCurrentChars(v)
                debouncedSaveStats(v, wordCount)
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Parole</label>
            <input
              type="number"
              className={inputCls}
              value={wordCount}
              onChange={(e) => {
                const v = Number(e.target.value)
                setWordCount(v)
                debouncedSaveStats(currentChars, v)
              }}
            />
          </div>
        </div>
      </div>

      {/* Main content: checklist + notes */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-5"
      >
        {/* Checklist */}
        <div className="lg:col-span-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <div className="mb-4 flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-300">Checklist</h2>
          </div>
          <ChecklistEditor
            items={checklist}
            onChange={saveChecklist}
          />
        </div>

        {/* Synopsis + Notes */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">Synopsis</h2>
            <textarea
              className={cn(inputCls, 'min-h-[100px] resize-y')}
              placeholder="Breve sintesi del capitolo..."
              value={synopsis}
              onChange={(e) => {
                setSynopsis(e.target.value)
                debouncedSaveText({ synopsis: e.target.value })
              }}
            />
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">Note interne</h2>
            <textarea
              className={cn(inputCls, 'min-h-[80px] resize-y')}
              placeholder="Appunti, idee, riferimenti..."
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value)
                debouncedSaveText({ notes: e.target.value })
              }}
            />
          </div>
        </div>
      </motion.div>

      {/* AI Analysis preview */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
        className="rounded-xl border border-violet-500/20 bg-violet-950/20 p-5"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold text-violet-300">Analisi AI</h2>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to={`/analysis?chapter=${chapter.id}&ask=1`}
              className="flex items-center gap-1 rounded-md border border-violet-700/40 bg-violet-900/20 px-2 py-1 text-xs text-violet-400 transition-colors hover:bg-violet-900/30 hover:text-violet-300"
            >
              <Sparkles className="h-3 w-3" />
              Chiedi
            </Link>
            <Link
              to={`/analysis?chapter=${chapter.id}`}
              className="text-xs text-violet-400 hover:underline"
            >
              Vai all'analisi completa →
            </Link>
          </div>
        </div>

        {analysis ? (
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-[var(--text-primary)]">{analysis.scores.overall.toFixed(1)}</p>
                <p className="text-xs text-slate-500">Overall</p>
              </div>
              <div className="flex-1 grid grid-cols-3 gap-2">
                {Object.entries(analysis.scores)
                  .filter(([k]) => k !== 'overall')
                  .map(([key, val]) => (
                    <div key={key} className="text-xs">
                      <span className="text-slate-500 capitalize">{key}</span>
                      <span className={cn(
                        'ml-1.5 font-semibold',
                        val >= 8 ? 'text-emerald-400' : val >= 6 ? 'text-blue-400' : 'text-amber-400'
                      )}>
                        {(val as number).toFixed(1)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
            <p className="text-xs text-slate-400 line-clamp-2">{analysis.summary}</p>
            <p className="text-xs text-slate-600">
              Analizzato {formatRelativeDate(analysis.analyzedAt)}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <Sparkles className="h-4 w-4 text-slate-600" />
            <span>Nessuna analisi disponibile.</span>
            <span className="text-xs text-slate-600">
              Aggiungi il testo del capitolo e avvia GitHub Actions per analizzarlo.
            </span>
          </div>
        )}
      </motion.div>

      {/* Prev / Next navigation */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
        className="flex items-center justify-between pt-2"
      >
        {prevChapter ? (
          <Link
            to={`/chapters/${prevChapter.id}`}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm text-slate-400 transition-colors hover:bg-[var(--overlay)] hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
            <div>
              <p className="text-xs text-slate-600">Precedente</p>
              <p className="font-medium">{prevChapter.title}</p>
            </div>
          </Link>
        ) : <div />}

        {nextChapter ? (
          <Link
            to={`/chapters/${nextChapter.id}`}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm text-slate-400 transition-colors hover:bg-[var(--overlay)] hover:text-slate-200"
          >
            <div className="text-right">
              <p className="text-xs text-slate-600">Successivo</p>
              <p className="font-medium">{nextChapter.title}</p>
            </div>
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : <div />}
      </motion.div>
    </div>
  )
}
