import {useEffect, useRef, useState} from 'react'
import {AnimatePresence, motion} from 'framer-motion'
import {ArrowLeft, CheckCheck, ChevronRight, CloudUpload, Loader2, RefreshCw, Save, Sparkles, X} from 'lucide-react'
import {Link, useParams} from 'react-router-dom'
import {useChaptersStore} from '@/stores/chaptersStore'
import {useAnalysisStore} from '@/stores/analysisStore'
import {useDriveStore} from '@/stores/driveStore'
import {useAuthStore} from '@/stores/authStore'
import {toast} from '@/stores/toastStore'
import {SyncSource, SyncStatus} from '@/types'
import {getValidAccessToken} from '@/services/driveAuthService'
import {getDriveFileContent} from '@/services/driveFileService'
import {parseYamlFrontmatter} from '@/services/driveParserService'
import {pushToDrive} from '@/services/driveSyncService'
import {applyTextReplacements} from '@/services/googleDocsService'
import * as chaptersService from '@/services/chaptersService'
import {patchAnalysis} from '@/services/analysisService'
import {cn} from '@/utils/cn'

const LS_SIDEBAR_KEY = 'book_editor_sidebar_'

const CORRECTION_BORDER: Record<string, string> = {
  grammar: 'border-red-500/50 bg-red-900/20',
  style: 'border-violet-500/50 bg-violet-900/20',
  clarity: 'border-blue-500/50 bg-blue-900/20',
  continuity: 'border-amber-500/50 bg-amber-900/20',
}
const CORRECTION_DOT: Record<string, string> = {
  grammar: 'bg-red-500',
  style: 'bg-violet-500',
  clarity: 'bg-blue-500',
  continuity: 'bg-amber-500',
}
const CORRECTION_LABEL: Record<string, string> = {
  grammar: 'Grammatica',
  style: 'Stile',
  clarity: 'Chiarezza',
  continuity: 'Continuità',
}

export default function EditorPage() {
  const {id} = useParams<{id: string}>()
  const {chapters, loadChapters} = useChaptersStore()
  const {analyses, loadAnalysis} = useAnalysisStore()
  const {config: driveConfig, patchTokens, load: loadDrive} = useDriveStore()
  const {user} = useAuthStore()

  const chapter = chapters.find((c) => c.id === id) ?? null
  const analysis = id ? (analyses[id] ?? null) : null

  const [content, setContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isPushing, setIsPushing] = useState(false)
  const [isReloading, setIsReloading] = useState(false)
  const [showSidebar, setShowSidebar] = useState(() => {
    try { return localStorage.getItem(LS_SIDEBAR_KEY + id) !== 'false' } catch { return true }
  })
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const [acceptedSet, setAcceptedSet] = useState<Set<number>>(new Set())
  const [dismissedSet, setDismissedSet] = useState<Set<number>>(new Set())
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void loadChapters()
    if (id) void loadAnalysis(id)
    if (user && !driveConfig) void loadDrive(user.uid)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Populate editor when chapter loads
  useEffect(() => {
    if (chapter) setContent(chapter.driveContent ?? '')
  }, [chapter?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const isDirty = content !== (chapter?.driveContent ?? '')
  const corrections = analysis?.corrections ?? []
  const visibleCorrections = corrections.filter((_, i) => !dismissedSet.has(i))

  function toggleSidebar() {
    setShowSidebar((prev) => {
      const next = !prev
      localStorage.setItem(LS_SIDEBAR_KEY + id, String(next))
      return next
    })
  }

  function highlightInEditor(idx: number) {
    setActiveIdx(idx)
    const c = corrections[idx]
    if (!c || !textareaRef.current) return
    const pos = content.indexOf(c.original)
    if (pos === -1) return
    textareaRef.current.focus()
    textareaRef.current.setSelectionRange(pos, pos + c.original.length)
    // Scroll textarea to the selection
    const before = content.slice(0, pos)
    const linesBefore = (before.match(/\n/g) ?? []).length
    const lineHeight = 28
    textareaRef.current.scrollTop = Math.max(0, linesBefore * lineHeight - 200)
  }

  function acceptCorrection(idx: number) {
    const c = corrections[idx]
    if (!c) return
    setContent((prev) => prev.replace(c.original, c.suggested))
    setAcceptedSet((prev) => new Set([...prev, idx]))
    setDismissedSet((prev) => new Set([...prev, idx]))
    setActiveIdx(null)
    toast.success('Correzione applicata')
  }

  function dismissCorrection(idx: number) {
    setDismissedSet((prev) => new Set([...prev, idx]))
    if (activeIdx === idx) setActiveIdx(null)
  }

  async function saveToFirebase() {
    if (!id) return
    setIsSaving(true)
    try {
      await chaptersService.updateChapter(id, {
        driveContent: content,
        currentChars: content.length,
        wordCount: content.split(/\s+/).filter(Boolean).length,
        syncStatus: SyncStatus.PENDING_PUSH,
        syncSource: SyncSource.MANUAL,
      })
      await loadChapters()
      toast.success('Salvato su Firebase')
    } catch (err) {
      toast.error('Errore salvataggio: ' + (err as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  async function saveToDrive() {
    if (!chapter || !driveConfig || !user) return
    setIsPushing(true)
    try {
      const {accessToken, updatedTokens} = await getValidAccessToken(driveConfig, user.uid)
      if (updatedTokens) await patchTokens(user.uid, updatedTokens)

      const newChapterData = {
        driveContent: content,
        currentChars: content.length,
        wordCount: content.split(/\s+/).filter(Boolean).length,
        syncStatus: SyncStatus.SYNCED,
        syncSource: SyncSource.DASHBOARD,
        lastSyncAt: new Date().toISOString(),
      }

      if (chapter.driveMimeType === 'application/vnd.google-apps.document' && chapter.driveFileId) {
        const replacements = [{original: chapter.driveContent ?? '', suggested: content}]
        const filtered = replacements.filter(({original, suggested}) => original !== suggested)
        if (filtered.length > 0) {
          await applyTextReplacements(accessToken, chapter.driveFileId, filtered)
        }
      } else {
        const updated = {...chapter, driveContent: content}
        await pushToDrive(updated, driveConfig, user.uid, (tokens) => patchTokens(user.uid, tokens))
      }

      await chaptersService.updateChapter(chapter.id, newChapterData)

      // Persist accepted corrections to analysis
      if (acceptedSet.size > 0) {
        await patchAnalysis(chapter.id, {
          acceptedCorrections: Array.from(acceptedSet),
          appliedAt: new Date().toISOString(),
        }).catch(() => {})
      }

      await loadChapters()
      toast.success('Testo salvato su Drive')
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('403') || msg.includes('insufficient')) {
        toast.error('Permesso negato — disconnetti e riconnetti Drive')
      } else {
        toast.error('Errore Drive: ' + msg)
      }
    } finally {
      setIsPushing(false)
    }
  }

  async function reloadFromDrive() {
    if (!chapter?.driveFileId || !driveConfig || !user) return
    setIsReloading(true)
    try {
      const {accessToken, updatedTokens} = await getValidAccessToken(driveConfig, user.uid)
      if (updatedTokens) await patchTokens(user.uid, updatedTokens)
      const raw = await getDriveFileContent(accessToken, chapter.driveFileId, chapter.driveMimeType ?? 'text/plain')
      const {body} = parseYamlFrontmatter(raw)
      await chaptersService.updateChapter(chapter.id, {
        driveContent: body,
        currentChars: body.length,
        wordCount: body.split(/\s+/).filter(Boolean).length,
        syncStatus: SyncStatus.SYNCED,
        syncSource: SyncSource.DRIVE,
        lastSyncAt: new Date().toISOString(),
      })
      await loadChapters()
      setContent(body)
      toast.success('Ricaricato da Drive')
    } catch (err) {
      toast.error('Errore: ' + (err as Error).message)
    } finally {
      setIsReloading(false)
    }
  }

  if (!chapter) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-base)]">
        <div className="text-center">
          <p className="text-sm text-slate-400">Capitolo non trovato</p>
          <Link to="/kanban" className="mt-3 block text-xs text-violet-400 hover:underline">
            Torna al Kanban
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg-base)]">

      {/* ── Toolbar ── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-sidebar)] px-4 py-2.5">
        <Link
          to={`/chapters/${id}`}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-slate-400 transition-colors hover:bg-[var(--overlay)] hover:text-slate-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Indietro
        </Link>

        <div className="h-4 w-px bg-[var(--border)]" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
            {String(chapter.number).padStart(2, '0')} — {chapter.title}
          </p>
          <p className="text-xs text-slate-500">
            {content.length.toLocaleString('it')} car.{' '}
            · {content.split(/\s+/).filter(Boolean).length.toLocaleString('it')} parole
            {isDirty && <span className="ml-2 text-amber-400">● Non salvato</span>}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {chapter.driveFileId && driveConfig && (
            <button
              onClick={() => void reloadFromDrive()}
              disabled={isReloading}
              title="Ricarica da Drive"
              className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs text-slate-400 transition-colors hover:bg-[var(--overlay)] hover:text-slate-200 disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isReloading && 'animate-spin')} />
              Drive
            </button>
          )}

          <button
            onClick={() => void saveToFirebase()}
            disabled={isSaving || !isDirty}
            className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs text-slate-400 transition-colors hover:bg-[var(--overlay)] hover:text-slate-200 disabled:opacity-40"
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salva
          </button>

          {driveConfig && (
            <button
              onClick={() => void saveToDrive()}
              disabled={isPushing}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                isDirty
                  ? 'bg-violet-600 text-white hover:bg-violet-500'
                  : 'border border-[var(--border)] text-slate-400 hover:bg-[var(--overlay)] hover:text-slate-200',
              )}
            >
              {isPushing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
              Pubblica su Drive
            </button>
          )}

          <div className="h-4 w-px bg-[var(--border)]" />

          <button
            onClick={toggleSidebar}
            title={showSidebar ? 'Nascondi suggerimenti AI' : 'Mostra suggerimenti AI'}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
              showSidebar
                ? 'border-violet-500/40 bg-violet-900/20 text-violet-300'
                : 'border-[var(--border)] text-slate-400 hover:bg-[var(--overlay)] hover:text-slate-200',
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {visibleCorrections.length > 0 ? `${visibleCorrections.length} suggerimenti` : 'Suggerimenti AI'}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Document editor */}
        <div className="flex-1 overflow-y-auto px-6 py-10">
          <motion.div
            initial={{opacity: 0, y: 12}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: 0.2}}
            className="mx-auto max-w-3xl"
          >
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Inizia a scrivere il tuo capitolo…"
              spellCheck={false}
              className={cn(
                'w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]',
                'px-10 py-10 text-[17px] leading-[1.85] text-[var(--text-primary)]',
                'font-serif shadow-2xl outline-none transition-colors',
                'placeholder-slate-700 focus:border-violet-500/25',
                'resize-none',
              )}
              style={{minHeight: 'calc(100vh - 180px)'}}
            />
          </motion.div>
        </div>

        {/* Corrections sidebar */}
        <AnimatePresence>
          {showSidebar && (
            <motion.aside
              key="sidebar"
              initial={{width: 0, opacity: 0}}
              animate={{width: 340, opacity: 1}}
              exit={{width: 0, opacity: 0}}
              transition={{duration: 0.2, ease: 'easeInOut'}}
              className="flex w-[340px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-sidebar)] overflow-hidden"
            >
              {/* Sidebar header */}
              <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-400" />
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">Suggerimenti AI</h2>
                  {visibleCorrections.length > 0 && (
                    <span className="rounded-full border border-violet-700/30 bg-violet-900/40 px-1.5 py-0.5 text-xs text-violet-300">
                      {visibleCorrections.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={toggleSidebar}
                  className="rounded-md p-1 text-slate-600 transition-colors hover:text-slate-300"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Correction list */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {corrections.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-14 text-center">
                    <Sparkles className="h-8 w-8 text-slate-700" />
                    <p className="text-sm text-slate-500">Nessuna analisi disponibile.</p>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Avvia l'analisi AI dalla pagina capitolo per ricevere suggerimenti.
                    </p>
                    <Link to="/analysis" className="text-xs text-violet-400 hover:underline">
                      Vai ad Analisi AI →
                    </Link>
                  </div>
                ) : visibleCorrections.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-14 text-center">
                    <CheckCheck className="h-8 w-8 text-emerald-600" />
                    <p className="text-sm text-slate-400">Tutte le correzioni gestite!</p>
                    <p className="text-xs text-slate-600">
                      {acceptedSet.size > 0 && `${acceptedSet.size} applicate · `}
                      {dismissedSet.size - acceptedSet.size > 0 && `${dismissedSet.size - acceptedSet.size} ignorate`}
                    </p>
                  </div>
                ) : (
                  <AnimatePresence>
                    {visibleCorrections.map((c) => {
                      const origIdx = corrections.indexOf(c)
                      const isActive = activeIdx === origIdx
                      const inText = content.includes(c.original)

                      return (
                        <motion.div
                          key={origIdx}
                          layout
                          initial={{opacity: 0, x: 16}}
                          animate={{opacity: 1, x: 0}}
                          exit={{opacity: 0, x: 16, height: 0, marginBottom: 0}}
                          transition={{duration: 0.15}}
                          onClick={() => highlightInEditor(origIdx)}
                          className={cn(
                            'cursor-pointer rounded-xl border p-3 space-y-2.5 transition-all',
                            isActive
                              ? (CORRECTION_BORDER[c.type] ?? 'border-violet-500/50 bg-violet-900/20')
                              : cn(
                                  'border-[var(--border)] bg-[var(--overlay)] hover:border-[var(--border-strong)]',
                                  !inText && 'opacity-40',
                                ),
                          )}
                        >
                          {/* Header row */}
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'h-2 w-2 shrink-0 rounded-full',
                                CORRECTION_DOT[c.type] ?? 'bg-slate-500',
                              )}
                            />
                            <span className="text-xs font-medium text-slate-400">
                              {CORRECTION_LABEL[c.type] ?? c.type}
                            </span>
                            {!inText && (
                              <span className="text-xs text-slate-600">· non trovato nel testo</span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                dismissCorrection(origIdx)
                              }}
                              title="Ignora"
                              className="ml-auto rounded p-0.5 text-slate-700 transition-colors hover:text-slate-400"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>

                          {/* Before / after */}
                          <div className="space-y-1.5 text-xs">
                            <p className="rounded-lg bg-red-950/25 px-2.5 py-1.5 text-slate-500 line-through">
                              {c.original}
                            </p>
                            <p className="rounded-lg bg-emerald-950/25 px-2.5 py-1.5 text-emerald-300">
                              {c.suggested}
                            </p>
                          </div>

                          {/* Note */}
                          {c.note && (
                            <p className="text-xs italic text-slate-600">{c.note}</p>
                          )}

                          {/* Action buttons */}
                          {inText && (
                            <div className="flex gap-2 pt-0.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  acceptCorrection(origIdx)
                                }}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-700/40 bg-emerald-700/25 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-700/40"
                              >
                                <CheckCheck className="h-3 w-3" />
                                Accetta
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  dismissCorrection(origIdx)
                                }}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] py-1.5 text-xs text-slate-400 transition-colors hover:bg-[var(--overlay)]"
                              >
                                Ignora
                              </button>
                            </div>
                          )}
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                )}
              </div>

              {/* Sidebar footer */}
              {analysis && (
                <div className="shrink-0 border-t border-[var(--border)] px-4 py-3">
                  <p className="text-xs text-slate-600">
                    Analisi del {new Date(analysis.analyzedAt).toLocaleDateString('it-IT')}{' '}
                    · Score: {analysis.scores.overall.toFixed(1)}/10{' '}
                    ·{' '}
                    <Link to="/analysis" className="text-violet-500 hover:text-violet-300">
                      Dettagli
                    </Link>
                  </p>
                </div>
              )}
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
