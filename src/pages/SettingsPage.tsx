import {useEffect, useState} from 'react'
import {motion} from 'framer-motion'
import {AlertTriangle, CheckCircle2, Download, ExternalLink, Folder, Link2, Loader2, LogOut, Package, RefreshCw, Save, Search, Trash2} from 'lucide-react'
import {useSettingsStore} from '@/stores/settingsStore'
import {useAuthStore} from '@/stores/authStore'
import {useChaptersStore} from '@/stores/chaptersStore'
import {useDriveStore} from '@/stores/driveStore'
import {toast} from '@/stores/toastStore'
import type {BookSettings, Chapter, DriveFile} from '@/types'
import {AI_PROVIDER_CONFIG, BookType, SyncSource, SyncStatus} from '@/types'
import DriveConnectButton from '@/components/drive/DriveConnectButton'
import FolderPicker from '@/components/drive/FolderPicker'
import ConflictResolver from '@/components/drive/ConflictResolver'
import {fullSync} from '@/services/driveSyncService'
import {getStoredPat, setStoredPat} from '@/services/githubWorkflow'
import {deleteAllAnalyses} from '@/services/analysisService'
import {getValidAccessToken} from '@/services/driveAuthService'
import {getDriveFileContent, listDriveFiles} from '@/services/driveFileService'
import {parseDriveFileToChapter} from '@/services/driveParserService'
import * as chaptersService from '@/services/chaptersService'
import {formatRelativeDate} from '@/utils/formatters'
import {cn} from '@/utils/cn'

function Field({
  label,
  sub,
  children,
}: {
  label: string
  sub?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-300">{label}</label>
      {sub && <p className="mb-1.5 text-xs text-slate-500">{sub}</p>}
      {children}
    </div>
  )
}

function Section({title, delay = 0, children}: {title: string; delay?: number; children: React.ReactNode}) {
  return (
    <motion.div
      initial={{opacity: 0, y: 8}}
      animate={{opacity: 1, y: 0}}
      transition={{delay}}
      className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-5"
    >
      <h2 className="text-sm font-semibold text-slate-300">{title}</h2>
      {children}
    </motion.div>
  )
}

const inputCls =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-slate-600 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/50'

export default function SettingsPage() {
  const {settings, loadSettings, saveSettings, isSaving} = useSettingsStore()
  const {user, logout} = useAuthStore()
  const {chapters, loadChapters} = useChaptersStore()
  const {config: driveConfig, isConnected: driveConnected, load: loadDrive, patchTokens} = useDriveStore()
  const [form, setForm] = useState<BookSettings>(settings)
  const [saved, setSaved] = useState(false)
  const [pat, setPat] = useState(() => settings.githubPat ?? getStoredPat())
  const [patSaved, setPatSaved] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncResult, setLastSyncResult] = useState<string | null>(null)
  const [conflictChapter, setConflictChapter] = useState<Chapter | null>(null)
  const [unlinkedFiles, setUnlinkedFiles] = useState<DriveFile[] | null>(null)
  const [isSearchingUnlinked, setIsSearchingUnlinked] = useState(false)
  const [importingFileId, setImportingFileId] = useState<string | null>(null)
  const [isResetting, setIsResetting] = useState(false)

  useEffect(() => {
    void loadSettings()
    void loadChapters()
  }, [loadSettings, loadChapters])

  useEffect(() => {
    if (user) void loadDrive(user.uid)
  }, [user, loadDrive])

  async function handleSyncNow() {
    if (!user || !driveConfig?.folderId) return
    setIsSyncing(true)
    setLastSyncResult(null)
    try {
      const result = await fullSync(driveConfig, user.uid, chapters, (tokens) =>
        patchTokens(user.uid, tokens),
      )
      await loadChapters()
      const msg = `✓ ${result.created} creati, ${result.updated} aggiornati, ${result.pushed} caricati, ${result.deleted} eliminati`
      setLastSyncResult(result.errors.length ? `${msg} — ${result.errors.length} errori` : msg)
      if (result.created > 0)
        toast.info(`${result.created} nuov${result.created === 1 ? 'o capitolo trovato' : 'i capitoli trovati'} su Drive`)
      if (result.updated > 0)
        toast.success(`${result.updated} capitol${result.updated === 1 ? 'o aggiornato' : 'i aggiornati'} da Drive`)
      if (result.pushed > 0)
        toast.success(`${result.pushed} capitol${result.pushed === 1 ? 'o inviato' : 'i inviati'} su Drive`)
      if (result.deleted > 0)
        toast.warning(`${result.deleted} capitol${result.deleted === 1 ? 'o eliminato' : 'i eliminati'} (file rimosso da Drive)`)
      if (result.conflicts > 0)
        toast.warning(`${result.conflicts} conflitt${result.conflicts === 1 ? 'o' : 'i'} da risolvere`)
      if (result.errors.length > 0)
        toast.error(`${result.errors.length} error${result.errors.length === 1 ? 'e' : 'i'} durante la sync`)
      if (result.created === 0 && result.updated === 0 && result.pushed === 0 && result.deleted === 0 && result.conflicts === 0)
        toast.success('Tutto aggiornato — nessuna modifica')
    } catch (err) {
      toast.error('Errore sync: ' + (err as Error).message)
      setLastSyncResult('Errore durante la sincronizzazione')
    } finally {
      setIsSyncing(false)
    }
  }

  useEffect(() => {
    setForm(settings)
  }, [settings])

  function update<K extends keyof BookSettings>(key: K, value: BookSettings[K]) {
    setForm((f) => ({...f, [key]: value}))
  }

  async function handleSave() {
    await saveSettings(form)
    setSaved(true)
    toast.success('Impostazioni salvate')
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleSearchUnlinked() {
    if (!user || !driveConfig?.folderId) return
    setIsSearchingUnlinked(true)
    try {
      const {accessToken, updatedTokens} = await getValidAccessToken(driveConfig, user.uid)
      if (updatedTokens) await patchTokens(user.uid, updatedTokens)
      const files = await listDriveFiles(accessToken, driveConfig.folderId)
      const linkedIds = new Set(chapters.map((c) => c.driveFileId).filter(Boolean))
      setUnlinkedFiles(files.filter((f) => !linkedIds.has(f.id)))
    } catch (err) {
      toast.error('Errore ricerca: ' + (err as Error).message)
    } finally {
      setIsSearchingUnlinked(false)
    }
  }

  async function handleImportFile(file: DriveFile) {
    if (!user || !driveConfig) return
    setImportingFileId(file.id)
    try {
      const {accessToken: importToken, updatedTokens: importUpdatedTokens} = await getValidAccessToken(driveConfig, user.uid)
      if (importUpdatedTokens) await patchTokens(user.uid, importUpdatedTokens)
      const content = await getDriveFileContent(importToken, file.id, file.mimeType)
      const {driveBody, ...fields} = parseDriveFileToChapter(content, file)
      const chapter: Chapter = {
        ...(fields as Chapter),
        driveFileId: file.id,
        driveFileName: file.name,
        driveMimeType: file.mimeType,
        driveWebViewLink: file.webViewLink ?? null,
        driveModifiedTime: file.modifiedTime,
        driveContent: driveBody,
        lastSyncAt: new Date().toISOString(),
        syncSource: SyncSource.DRIVE,
        syncStatus: SyncStatus.SYNCED,
      }
      await chaptersService.addChapter(chapter)
      await loadChapters()
      setUnlinkedFiles((prev) => prev?.filter((f) => f.id !== file.id) ?? null)
      toast.success(`"${file.name}" importato come cap. ${chapter.number}`)
    } catch (err) {
      toast.error('Errore importazione: ' + (err as Error).message)
    } finally {
      setImportingFileId(null)
    }
  }

  async function handleResetChapters() {
    if (!confirm('Sei sicuro? Questa operazione elimina TUTTI i capitoli da Firebase. Non è reversibile.')) return
    if (!confirm(`Conferma: verranno eliminati ${chapters.length} capitoli. Continuare?`)) return
    setIsResetting(true)
    try {
      await Promise.all([
        Promise.all(chapters.map((c) => chaptersService.deleteChapter(c.id))),
        deleteAllAnalyses(),
      ])
      await loadChapters()
      toast.success('Tutti i capitoli e le analisi eliminati da Firebase')
    } catch (err) {
      toast.error('Errore reset: ' + (err as Error).message)
    } finally {
      setIsResetting(false)
    }
  }

  function handleExport() {
    const data = {
      exportedAt: new Date().toISOString(),
      settings,
      chapters,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `book-export-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Esportazione completata')
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Impostazioni</h1>
        <p className="mt-1 text-sm text-slate-400">Configura le informazioni del tuo libro</p>
      </div>

      {/* Account */}
      <Section title="Account" delay={0}>
        <div className="flex items-center gap-4">
          {user?.photoURL && (
            <img
              src={user.photoURL}
              alt={user.displayName ?? ''}
              className="h-12 w-12 rounded-full border border-[var(--border-strong)]"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-[var(--text-primary)]">{user?.displayName ?? user?.email}</p>
            <p className="text-sm text-slate-500">{user?.email}</p>
          </div>
        </div>
        <div className="border-t border-[var(--border)] pt-4 space-y-3">
          <Field label="GitHub Personal Access Token" sub="Necessario per avviare l'analisi AI (scope: workflow)">
            <div className="flex gap-2">
              <input
                type="password"
                className={inputCls + ' flex-1'}
                value={pat}
                onChange={(e) => { setPat(e.target.value); setPatSaved(false) }}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              />
              <button
                onClick={async () => {
                  setStoredPat(pat)
                  await saveSettings({...settings, githubPat: pat})
                  setPatSaved(true)
                  setTimeout(() => setPatSaved(false), 2000)
                }}
                className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500 transition-colors"
              >
                {patSaved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                {patSaved ? 'Salvato' : 'Salva'}
              </button>
            </div>
          </Field>
          <button
            onClick={() => {
              if (confirm('Sei sicuro di voler uscire?')) logout()
            }}
            className="flex items-center gap-2 rounded-lg border border-red-800/40 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-900/20 hover:text-red-300"
          >
            <LogOut className="h-4 w-4" />
            Disconnetti
          </button>
        </div>
      </Section>

      {/* Book info */}
      <Section title="Informazioni Libro" delay={0.05}>
        <Field label="Titolo">
          <input
            className={inputCls}
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder="Il titolo del tuo libro"
          />
        </Field>

        <Field label="Autore">
          <input
            className={inputCls}
            value={form.author}
            onChange={(e) => update('author', e.target.value)}
            placeholder="Il tuo nome"
          />
        </Field>

        <Field label="Tipologia libro" sub="Determina le sezioni extra nell'analisi AI (es. accuratezza storica)">
          <select
            className={inputCls}
            value={form.bookType ?? 'generico'}
            onChange={(e) => update('bookType', e.target.value as typeof form.bookType)}
          >
            {Object.entries({
              generico: 'Generico',
              storico: 'Storico',
              fantasy: 'Fantasy',
              thriller: 'Thriller',
              romanzo: 'Romanzo',
              giallo: 'Giallo',
              saggio: 'Saggio',
              autobiografia: 'Autobiografia',
            } satisfies Record<(typeof BookType)[keyof typeof BookType], string>).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </Field>

        <Field label="AI predefinita per analisi" sub="Il modello AI usato di default quando avvii un'analisi. Puoi cambiarlo anche al momento del lancio.">
          <select
            className={inputCls}
            value={form.defaultAIProvider ?? 'claude'}
            onChange={(e) => update('defaultAIProvider', e.target.value as typeof form.defaultAIProvider)}
          >
            {Object.entries(AI_PROVIDER_CONFIG).map(([val, cfg]) => (
              <option key={val} value={val}>{cfg.icon} {cfg.label}</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Sotto-genere / Ambientazione">
            <input
              className={inputCls}
              value={form.genre}
              onChange={(e) => update('genre', e.target.value)}
              placeholder="es. Prima guerra mondiale, High fantasy..."
            />
          </Field>
          <Field label="Lingua">
            <input
              className={inputCls}
              value={form.language}
              onChange={(e) => update('language', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Target parole">
            <input
              type="number"
              className={inputCls}
              value={form.targetWords}
              onChange={(e) => update('targetWords', Number(e.target.value))}
            />
          </Field>
          <Field label="Target capitoli">
            <input
              type="number"
              className={inputCls}
              value={form.targetChapters}
              onChange={(e) => update('targetChapters', Number(e.target.value))}
            />
          </Field>
        </div>

        <Field label="Data inizio scrittura">
          <input
            type="date"
            className={inputCls}
            value={form.startDate.split('T')[0]}
            onChange={(e) => update('startDate', new Date(e.target.value).toISOString())}
          />
        </Field>

        <Field label="Sinossi">
          <textarea
            className={`${inputCls} min-h-[80px] resize-y`}
            value={form.synopsis}
            onChange={(e) => update('synopsis', e.target.value)}
            placeholder="Breve descrizione del libro..."
          />
        </Field>
      </Section>

      {/* Dashboard params */}
      <Section title="Parametri Dashboard" delay={0.1}>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Caratteri/pagina" sub="Default: 1800">
            <input
              type="number"
              className={inputCls}
              value={form.charsPerPage}
              onChange={(e) => update('charsPerPage', Number(e.target.value))}
            />
          </Field>
          <Field label="Parole/pagina" sub="Default: 250">
            <input
              type="number"
              className={inputCls}
              value={form.wordsPerPage}
              onChange={(e) => update('wordsPerPage', Number(e.target.value))}
            />
          </Field>
          <Field label="Parole/min lettura" sub="Default: 250">
            <input
              type="number"
              className={inputCls}
              value={form.wordsPerMinuteReading}
              onChange={(e) => update('wordsPerMinuteReading', Number(e.target.value))}
            />
          </Field>
        </div>
      </Section>

      {/* Google Drive */}
      <Section title="Google Drive" delay={0.15}>
        {driveConnected && driveConfig ? (
          <div className="space-y-4">
            {/* Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Connesso
              </div>
              {driveConfig.createdAt && (
                <span className="text-xs text-slate-600">
                  Dal {formatRelativeDate(driveConfig.createdAt)}
                </span>
              )}
            </div>

            {/* Drive stats — E1.1 */}
            <div className="grid grid-cols-3 gap-3 rounded-lg border border-[var(--border)] bg-[var(--overlay)] p-3 text-center">
              {(() => {
                const linked = chapters.filter((c) => c.driveFileId).length
                const pending = chapters.filter((c) => c.syncStatus === SyncStatus.PENDING_PUSH).length
                const conflicts = chapters.filter((c) => c.syncStatus === SyncStatus.CONFLICT).length
                return (
                  <>
                    <div>
                      <p className="text-base font-bold text-[var(--text-primary)]">{linked}</p>
                      <p className="text-xs text-slate-500 flex items-center justify-center gap-1">
                        <Link2 className="h-3 w-3" />
                        Collegati
                      </p>
                    </div>
                    <div>
                      <p className={cn('text-base font-bold', pending > 0 ? 'text-amber-400' : 'text-[var(--text-primary)]')}>{pending}</p>
                      <p className="text-xs text-slate-500">Da inviare</p>
                    </div>
                    <div>
                      <p className={cn('text-base font-bold', conflicts > 0 ? 'text-red-400' : 'text-[var(--text-primary)]')}>{conflicts}</p>
                      <p className="text-xs text-slate-500">Conflitti</p>
                    </div>
                  </>
                )
              })()}</div>

            {/* Folder picker */}
            <div>
              <p className="mb-2 text-xs font-medium text-slate-400 flex items-center gap-1.5">
                <Folder className="h-3.5 w-3.5" />
                Cartella monitorata
              </p>
              <FolderPicker />
              {!driveConfig.folderId && (
                <p className="mt-2 text-xs text-amber-400">
                  Seleziona una cartella Drive per abilitare la sincronizzazione
                </p>
              )}
            </div>

            {/* Sync now */}
            {driveConfig.folderId && (
              <div className="space-y-2">
                <button
                  onClick={handleSyncNow}
                  disabled={isSyncing}
                  className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-[var(--overlay)] disabled:opacity-50"
                >
                  <RefreshCw className={cn('h-4 w-4', isSyncing && 'animate-spin')} />
                  {isSyncing ? 'Sincronizzazione...' : 'Sincronizza ora'}
                </button>
                {lastSyncResult && (
                  <p className="text-xs text-slate-500">{lastSyncResult}</p>
                )}
              </div>
            )}

            {/* File non collegati — E1.5 */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => void handleSearchUnlinked()}
                  disabled={isSearchingUnlinked || !driveConfig.folderId}
                  className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-[var(--overlay)] disabled:opacity-50"
                >
                  {isSearchingUnlinked
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Search className="h-4 w-4" />}
                  File non collegati
                </button>
                {unlinkedFiles !== null && (
                  <span className="text-xs text-slate-500">
                    {unlinkedFiles.length === 0 ? 'Tutti collegati ✓' : `${unlinkedFiles.length} da importare`}
                  </span>
                )}
              </div>
              {unlinkedFiles && unlinkedFiles.length > 0 && (
                <div className="rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
                  {unlinkedFiles.map((file) => (
                    <div key={file.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-300 truncate">{file.name}</p>
                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-400"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-2.5 w-2.5" />
                            Apri
                          </a>
                        )}
                      </div>
                      <button
                        onClick={() => void handleImportFile(file)}
                        disabled={importingFileId === file.id}
                        className="shrink-0 flex items-center gap-1.5 rounded-md border border-violet-700/30 bg-violet-900/20 px-2.5 py-1 text-xs text-violet-400 transition-colors hover:bg-violet-900/40 disabled:opacity-50"
                      >
                        {importingFileId === file.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Package className="h-3 w-3" />}
                        Importa
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Conflitti */}
            {(() => {
              const conflicts = chapters.filter((c) => c.syncStatus === 'conflict')
              if (!conflicts.length) return null
              return (
                <div className="rounded-lg border border-red-800/40 bg-red-900/10 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {conflicts.length} conflitt{conflicts.length === 1 ? 'o' : 'i'} da risolvere
                  </p>
                  <div className="space-y-1">
                    {conflicts.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setConflictChapter(c)}
                        className="block w-full rounded-md px-2 py-1 text-left text-xs text-red-300 hover:bg-red-900/20"
                      >
                        {c.title} →
                      </button>
                    ))}
                  </div>
                </div>
              )
            })()}

            <div className="border-t border-[var(--border)] pt-3">
              <DriveConnectButton />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">
              Connetti il tuo Google Drive per sincronizzare automaticamente i file dei capitoli
              e triggherare le analisi AI.
            </p>
            <DriveConnectButton />
          </div>
        )}
      </Section>

      {/* Reset dati */}
      <Section title="Reset Dati" delay={0.18}>
        <p className="text-sm text-slate-400">
          Elimina tutti i capitoli da Firebase (Firestore). Operazione irreversibile — i file su Google Drive non vengono toccati.
        </p>
        <button
          onClick={() => void handleResetChapters()}
          disabled={isResetting || chapters.length === 0}
          className="flex items-center gap-2 rounded-lg border border-red-800/40 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-900/20 hover:text-red-300 disabled:opacity-50"
        >
          {isResetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {isResetting ? 'Reset in corso...' : `Elimina tutti i capitoli (${chapters.length})`}
        </button>
      </Section>

      {/* Data export */}
      <Section title="Dati e Export" delay={0.2}>
        <p className="text-sm text-slate-400">
          Scarica un backup completo dei tuoi capitoli e impostazioni in formato JSON.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-[var(--overlay)] hover:text-[var(--text-primary)]"
          >
            <Download className="h-4 w-4" />
            Esporta JSON ({chapters.length} capitoli)
          </button>
        </div>
      </Section>

      {/* Conflict resolver */}
      {conflictChapter && driveConfig && user && (
        <ConflictResolver
          chapter={conflictChapter}
          config={driveConfig}
          uid={user.uid}
          open={!!conflictChapter}
          onClose={() => setConflictChapter(null)}
          onResolved={() => { void loadChapters(); setConflictChapter(null) }}
          onTokenRefresh={(tokens) => patchTokens(user.uid, tokens)}
        />
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-violet-500 disabled:opacity-50"
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {saved ? 'Salvato!' : 'Salva impostazioni'}
      </button>
    </div>
  )
}
