import {useCallback, useEffect, useRef, useState} from 'react'
import {AnimatePresence, motion} from 'framer-motion'
import {BookUser, ChevronRight, Edit2, Loader2, Play, Plus, RefreshCw, Save, Search, Sparkles, Tag, Trash2, Users, X,} from 'lucide-react'
import {useCharactersStore} from '@/stores/charactersStore'
import {useCharacterAnalysisStore} from '@/stores/characterAnalysisStore'
import {useChaptersStore} from '@/stores/chaptersStore'
import {triggerWorkflow} from '@/services/githubWorkflow'
import {getCharacterAnalysisError} from '@/services/characterAnalysisService'
import {toast} from '@/stores/toastStore'
import {cn} from '@/utils/cn'
import {formatRelativeDate} from '@/utils/formatters'
import {GITHUB_REPO_NAME, GITHUB_REPO_OWNER} from '@/utils/constants'
import {AI_PROVIDER_CONFIG, AIProvider, type Character, CHARACTER_ROLE_CONFIG, CHARACTER_SCORE_LABELS, type CharacterAnalysis, CharacterRole,} from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(v: number) {
  if (v >= 8) return 'text-emerald-400'
  if (v >= 6) return 'text-green-400'
  if (v >= 4) return 'text-yellow-400'
  if (v >= 2) return 'text-orange-400'
  return 'text-red-400'
}

function ScoreBar({label, value}: {label: string; value: number}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-xs text-slate-400">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-[var(--overlay)]">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-violet-600 to-cyan-500"
          initial={{width: 0}}
          animate={{width: `${(value / 10) * 100}%`}}
          transition={{duration: 0.6, ease: 'easeOut'}}
        />
      </div>
      <span className={cn('w-6 text-right text-xs font-medium tabular-nums', scoreColor(value))}>{value.toFixed(1)}</span>
    </div>
  )
}

type DrawerTab = 'profile' | 'chapters' | 'analysis'

const EMPTY_CHAR: Omit<Character, 'id'> = {
  name: '',
  aliases: [],
  role: CharacterRole.SECONDARY,
  age: '',
  physicalDescription: '',
  personalityTraits: [],
  backstory: '',
  motivation: '',
  chaptersAppearing: [],
  notes: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CharactersPage() {
  const {characters, isLoading: charsLoading, load, create, update, remove, removeAll} = useCharactersStore()
  const {analyses, load: loadAnalysis, poll} = useCharacterAnalysisStore()
  const {chapters} = useChaptersStore()

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<CharacterRole | 'all'>('all')
  const [selected, setSelected] = useState<Character | null>(null)
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('profile')

  // Edit / create
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Omit<Character, 'id'>>>({})
  const [newTrait, setNewTrait] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [createForm, setCreateForm] = useState({name: '', role: CharacterRole.SECONDARY as CharacterRole})

  // Analysis
  const [activeProvider, setActiveProvider] = useState<AIProvider>(AIProvider.CLAUDE)
  const [triggering, setTriggering] = useState(false)
  const [pendingAnalysis, setPendingAnalysis] = useState<{characterId: string; startedAt: string} | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [analyzingAll, setAnalyzingAll] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  // overview: 'characters' | 'bychapter'
  const [overviewView, setOverviewView] = useState<'characters' | 'bychapter'>('characters')

  // Load characters on mount
  useEffect(() => {
    void load()
  }, [load])

  // Load analysis when character / provider changes
  useEffect(() => {
    if (selected) void loadAnalysis(selected.id, activeProvider)
  }, [selected, activeProvider, loadAnalysis])

  // Keep selected in sync with store updates
  useEffect(() => {
    if (!selected) return
    const updated = characters.find((c) => c.id === selected.id)
    if (updated) setSelected(updated)
  }, [characters]) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for new analysis
  useEffect(() => {
    if (!pendingAnalysis) return
    const {characterId, startedAt} = pendingAnalysis

    pollRef.current = setInterval(async () => {
      // Check for error first
      const err = await getCharacterAnalysisError(characterId, activeProvider).catch(() => null)
      if (err && err.failedAt > startedAt) {
        clearInterval(pollRef.current!)
        setPendingAnalysis(null)
        setAnalysisError(err.error)
        return
      }
      const result = await poll(characterId, activeProvider, startedAt)
      if (result) {
        clearInterval(pollRef.current!)
        setPendingAnalysis(null)
        toast.success('Analisi personaggio completata!')
        if (selected?.id === characterId) void loadAnalysis(characterId, activeProvider)
      }
    }, 10000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [pendingAnalysis, activeProvider, poll, loadAnalysis, selected])

  const currentAnalysis = selected ? (analyses[selected.id]?.[activeProvider] ?? null) : null

  const filtered = characters.filter((c) => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase())
    const matchRole = roleFilter === 'all' || c.role === roleFilter
    return matchSearch && matchRole
  })

  const handleSelect = (char: Character) => {
    setSelected(char)
    setDrawerTab('profile')
    setIsEditing(false)
    setAnalysisError(null)
  }

  const handleTriggerAnalysis = async () => {
    if (!selected) return
    setTriggering(true)
    setAnalysisError(null)
    try {
      await triggerWorkflow(GITHUB_REPO_OWNER, GITHUB_REPO_NAME, 'character-analysis.yml', {
        character_id: selected.id,
        ai_provider: activeProvider,
      })
      setPendingAnalysis({characterId: selected.id, startedAt: new Date().toISOString()})
      toast.success('Analisi avviata! Il risultato sarà disponibile in ~2 minuti.')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setTriggering(false)
    }
  }

  const handleCreate = async () => {
    if (!createForm.name.trim()) return
    await create({
      ...EMPTY_CHAR,
      name: createForm.name.trim(),
      role: createForm.role,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    setIsCreating(false)
    setCreateForm({name: '', role: CharacterRole.SECONDARY})
    toast.success('Personaggio creato!')
  }

  const startEdit = useCallback(() => {
    if (!selected) return
    setEditForm({
      name: selected.name,
      aliases: [...selected.aliases],
      role: selected.role,
      age: selected.age ?? '',
      physicalDescription: selected.physicalDescription,
      personalityTraits: [...selected.personalityTraits],
      backstory: selected.backstory,
      motivation: selected.motivation,
      notes: selected.notes,
    })
    setIsEditing(true)
  }, [selected])

  const handleSaveEdit = async () => {
    if (!selected) return
    await update(selected.id, editForm)
    setIsEditing(false)
    setEditForm({})
    setNewTrait('')
    toast.success('Personaggio aggiornato!')
  }

  const handleDelete = async (id: string) => {
    await remove(id)
    if (selected?.id === id) setSelected(null)
    toast.success('Personaggio eliminato.')
  }

  const handleResetAll = async () => {
    await removeAll()
    setSelected(null)
    setConfirmReset(false)
    toast.success('Tutti i personaggi eliminati.')
  }

  const handleAnalyzeAll = async () => {
    if (characters.length === 0) return
    setAnalyzingAll(true)
    try {
      for (const char of characters) {
        await triggerWorkflow(GITHUB_REPO_OWNER, GITHUB_REPO_NAME, 'character-analysis.yml', {
          character_id: char.id,
          ai_provider: activeProvider,
        })
      }
      toast.success(`${characters.length} analisi avviate! I risultati arriveranno in qualche minuto.`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setAnalyzingAll(false)
    }
  }

  const addTrait = () => {
    const t = newTrait.trim()
    if (!t) return
    setEditForm((f) => ({...f, personalityTraits: [...(f.personalityTraits ?? []), t]}))
    setNewTrait('')
  }

  const removeTrait = (i: number) => {
    setEditForm((f) => ({...f, personalityTraits: (f.personalityTraits ?? []).filter((_, idx) => idx !== i)}))
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">
      {/* LEFT — character list */}
      <div className="flex w-[300px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)]">
        {/* Header */}
        <div className="border-b border-[var(--border)] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 shrink-0 text-violet-400" />
            <span className="flex-1 text-sm font-bold text-[var(--text-primary)]">Personaggi</span>
            <span className="rounded-full bg-[var(--overlay)] px-1.5 py-0.5 text-[10px] text-slate-500">{characters.length}</span>
            <button
              onClick={() => setIsCreating(true)}
              title="Nuovo personaggio"
              className="rounded-md p-1 text-violet-400 transition-colors hover:bg-violet-900/30 hover:text-violet-300"
            >
              <Plus className="h-4 w-4" />
            </button>
            {characters.length > 0 && (
              confirmReset ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => void handleResetAll()} className="rounded px-1.5 py-0.5 text-[10px] font-medium text-rose-400 bg-rose-900/20 hover:bg-rose-900/40">Sì, svuota</button>
                  <button onClick={() => setConfirmReset(false)} className="text-[10px] text-slate-500 hover:text-slate-300">No</button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmReset(true)}
                  title="Svuota tutti i personaggi"
                  className="rounded-md p-1 text-slate-600 transition-colors hover:bg-rose-900/20 hover:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )
            )}
          </div>

          {/* Search */}
          <div className="relative mt-2">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca…"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--overlay)] py-1 pl-6 pr-2 text-xs text-slate-300 placeholder:text-slate-600 outline-none focus:border-violet-500/40"
            />
          </div>

          {/* Role filter */}
          <div className="mt-2 flex flex-wrap gap-1">
            {([['all', 'Tutti'], ...Object.entries(CHARACTER_ROLE_CONFIG).map(([r, c]) => [r, c.label])] as [string, string][]).map(([role, label]) => {
              const active = roleFilter === role
              const cfg = role !== 'all' ? CHARACTER_ROLE_CONFIG[role as CharacterRole] : null
              return (
                <button
                  key={role}
                  onClick={() => setRoleFilter(role as CharacterRole | 'all')}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors',
                    active && cfg ? cn(cfg.bg, cfg.color, cfg.border) : active ? 'bg-violet-900/30 text-violet-300 border-violet-700/40' : 'border-transparent text-slate-500 hover:text-slate-300',
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* List — compact rows */}
        <div className="flex-1 overflow-y-auto">
          {charsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center">
              <BookUser className="mx-auto mb-2 h-8 w-8 text-slate-600" />
              <p className="text-xs text-slate-500">
                {search || roleFilter !== 'all' ? 'Nessun risultato' : 'Nessun personaggio ancora'}
              </p>
              {!search && roleFilter === 'all' && (
                <button onClick={() => setIsCreating(true)} className="mt-2 text-xs text-violet-400 hover:text-violet-300">
                  + Crea il primo
                </button>
              )}
            </div>
          ) : (
            <div className="py-1">
              {filtered.map((char) => {
                const cfg = CHARACTER_ROLE_CONFIG[char.role]
                const isSelected = selected?.id === char.id
                return (
                  <button
                    key={char.id}
                    onClick={() => handleSelect(char)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-[var(--overlay)]',
                      isSelected && 'bg-violet-900/15 border-l-2 border-l-violet-500 pl-2.5',
                    )}
                  >
                    {/* Role dot */}
                    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold border', cfg.bg, cfg.color, cfg.border)}>
                      {char.name[0]?.toUpperCase() ?? '?'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-primary)]">{char.name}</span>
                    {char.chaptersAppearing.length > 0 && (
                      <span className="shrink-0 rounded bg-[var(--overlay)] px-1 py-0.5 text-[10px] tabular-nums text-slate-500">
                        {char.chaptersAppearing.length}
                      </span>
                    )}
                    {isSelected && <ChevronRight className="h-3 w-3 shrink-0 text-violet-400" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — character detail */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div
              key={selected.id}
              initial={{opacity: 0, x: 16}}
              animate={{opacity: 1, x: 0}}
              exit={{opacity: 0, x: 16}}
              transition={{duration: 0.2}}
              className="flex h-full flex-col"
            >
              {/* Character header */}
              <CharacterHeader
                character={selected}
                isEditing={isEditing}
                editForm={editForm}
                onEdit={startEdit}
                onSave={handleSaveEdit}
                onCancel={() => {setIsEditing(false); setEditForm({})}}
                onDelete={() => void handleDelete(selected.id)}
                onFormChange={setEditForm}
              />

              {/* Tabs */}
              <div className="flex gap-0 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-6">
                {([
                  {id: 'profile', label: 'Profilo'},
                  {id: 'chapters', label: `Capitoli (${selected.chaptersAppearing.length})`},
                  {id: 'analysis', label: 'Analisi'},
                ] as const).map(({id, label}) => (
                  <button
                    key={id}
                    onClick={() => setDrawerTab(id)}
                    className={cn(
                      'border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                      drawerTab === id
                        ? 'border-violet-500 text-violet-300'
                        : 'border-transparent text-slate-500 hover:text-slate-300',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto">
                {drawerTab === 'profile' && (
                  <ProfileTab
                    character={selected}
                    isEditing={isEditing}
                    editForm={editForm}
                    newTrait={newTrait}
                    onFormChange={setEditForm}
                    onNewTraitChange={setNewTrait}
                    onAddTrait={addTrait}
                    onRemoveTrait={removeTrait}
                  />
                )}
                {drawerTab === 'chapters' && (
                  <ChaptersTab character={selected} allChapters={chapters} />
                )}
                {drawerTab === 'analysis' && (
                  <AnalysisTab
                    analysis={currentAnalysis}
                    activeProvider={activeProvider}
                    triggering={triggering}
                    pendingAnalysis={!!pendingAnalysis && pendingAnalysis.characterId === selected.id}
                    error={analysisError}
                    onProviderChange={setActiveProvider}
                    onTrigger={() => void handleTriggerAnalysis()}
                    onReload={() => void loadAnalysis(selected.id, activeProvider)}
                  />
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{opacity: 0}}
              animate={{opacity: 1}}
              exit={{opacity: 0}}
              className="flex-1 overflow-y-auto"
            >
              <OverviewPanel
                characters={characters}
                allChapters={chapters}
                analyses={analyses}
                activeProvider={activeProvider}
                analyzingAll={analyzingAll}
                view={overviewView}
                onViewChange={setOverviewView}
                onProviderChange={setActiveProvider}
                onAnalyzeAll={() => void handleAnalyzeAll()}
                onSelect={handleSelect}
                onCreateNew={() => setIsCreating(true)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Create character modal */}
      <AnimatePresence>
        {isCreating && (
          <>
            <motion.div
              initial={{opacity: 0}}
              animate={{opacity: 1}}
              exit={{opacity: 0}}
              onClick={() => setIsCreating(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{opacity: 0, scale: 0.95, y: 12}}
              animate={{opacity: 1, scale: 1, y: 0}}
              exit={{opacity: 0, scale: 0.95}}
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-2xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-[var(--text-primary)]">Nuovo personaggio</h3>
                <button onClick={() => setIsCreating(false)} className="text-slate-500 hover:text-slate-300">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Nome *</label>
                  <input
                    autoFocus
                    value={createForm.name}
                    onChange={(e) => setCreateForm((f) => ({...f, name: e.target.value}))}
                    onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
                    placeholder="Es: Marco Ferrini"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 outline-none focus:border-violet-500/40"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Ruolo</label>
                  <select
                    value={createForm.role}
                    onChange={(e) => setCreateForm((f) => ({...f, role: e.target.value as CharacterRole}))}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-3 py-2 text-sm text-slate-300 outline-none focus:border-violet-500/40"
                  >
                    {Object.entries(CHARACTER_ROLE_CONFIG).map(([role, cfg]) => (
                      <option key={role} value={role}>{cfg.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setIsCreating(false)}
                  className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-slate-400 hover:bg-[var(--overlay)]"
                >
                  Annulla
                </button>
                <button
                  onClick={() => void handleCreate()}
                  disabled={!createForm.name.trim()}
                  className="flex-1 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
                >
                  Crea
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Character Header ─────────────────────────────────────────────────────────

function CharacterHeader({
  character,
  isEditing,
  editForm,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onFormChange,
}: {
  character: Character
  isEditing: boolean
  editForm: Partial<Omit<Character, 'id'>>
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
  onFormChange: (f: Partial<Omit<Character, 'id'>>) => void
}) {
  const cfg = CHARACTER_ROLE_CONFIG[isEditing ? (editForm.role ?? character.role) : character.role]
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-4">
      <div className="flex items-center gap-4">
        {/* Avatar */}
        <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-bold', cfg.bg, cfg.color)}>
          {(isEditing ? editForm.name : character.name)?.[0]?.toUpperCase() ?? '?'}
        </div>

        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                value={editForm.name ?? ''}
                onChange={(e) => onFormChange({...editForm, name: e.target.value})}
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-3 py-1.5 text-base font-semibold text-[var(--text-primary)] outline-none focus:border-violet-500/40"
              />
              <select
                value={editForm.role ?? character.role}
                onChange={(e) => onFormChange({...editForm, role: e.target.value as CharacterRole})}
                className="rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-2 py-1.5 text-xs outline-none focus:border-violet-500/40"
              >
                {Object.entries(CHARACTER_ROLE_CONFIG).map(([r, c]) => (
                  <option key={r} value={r}>{c.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-bold text-[var(--text-primary)]">{character.name}</h2>
              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', cfg.bg, cfg.color)}>
                {cfg.label}
              </span>
            </div>
          )}

          {(character.aliases.length > 0 || (isEditing && editForm.aliases && editForm.aliases.length > 0)) && (
            <p className="mt-0.5 text-xs text-slate-500">
              Alias: {(isEditing ? editForm.aliases : character.aliases)?.join(', ')}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          {isEditing ? (
            <>
              <button onClick={onCancel} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-slate-400 hover:bg-[var(--overlay)]">
                Annulla
              </button>
              <button
                onClick={onSave}
                className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
              >
                <Save className="h-3.5 w-3.5" /> Salva
              </button>
            </>
          ) : (
            <>
              <button onClick={onEdit} className="rounded-lg border border-[var(--border)] p-2 text-slate-500 transition-colors hover:bg-[var(--overlay)] hover:text-slate-300" title="Modifica">
                <Edit2 className="h-4 w-4" />
              </button>
              {confirmDelete ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-rose-400">Sicuro?</span>
                  <button onClick={onDelete} className="rounded-lg bg-rose-600/20 px-2 py-1 text-xs text-rose-400 hover:bg-rose-600/30">Sì</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs text-slate-500 hover:text-slate-300">No</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="rounded-lg border border-[var(--border)] p-2 text-slate-500 transition-colors hover:bg-rose-900/20 hover:text-rose-400" title="Elimina">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab({
  character,
  isEditing,
  editForm,
  newTrait,
  onFormChange,
  onNewTraitChange,
  onAddTrait,
  onRemoveTrait,
}: {
  character: Character
  isEditing: boolean
  editForm: Partial<Omit<Character, 'id'>>
  newTrait: string
  onFormChange: (f: Partial<Omit<Character, 'id'>>) => void
  onNewTraitChange: (v: string) => void
  onAddTrait: () => void
  onRemoveTrait: (i: number) => void
}) {
  const display = isEditing ? editForm : character

  const fields = [
    {key: 'age', label: 'Età', placeholder: 'Es: 32 anni', multiline: false},
    {key: 'physicalDescription', label: 'Descrizione fisica', placeholder: 'Capelli scuri, occhi verdi…', multiline: true},
    {key: 'backstory', label: 'Backstory', placeholder: 'Storia passata del personaggio…', multiline: true},
    {key: 'motivation', label: 'Motivazione', placeholder: 'Cosa vuole ottenere? Cosa lo spinge?', multiline: true},
    {key: 'notes', label: 'Note autore', placeholder: 'Note personali, idee future…', multiline: true},
  ] as const

  return (
    <div className="space-y-6 p-6">
      {/* Tratti della personalità */}
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <Tag className="h-3.5 w-3.5" />
          Tratti della personalità
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {(isEditing ? editForm.personalityTraits : character.personalityTraits)?.map((trait, i) => (
            <span
              key={i}
              className="flex items-center gap-1 rounded-full bg-violet-900/30 px-2.5 py-1 text-xs text-violet-300"
            >
              {trait}
              {isEditing && (
                <button onClick={() => onRemoveTrait(i)} className="ml-0.5 text-violet-500 hover:text-rose-400">
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {(isEditing ? editForm.personalityTraits : character.personalityTraits)?.length === 0 && !isEditing && (
            <span className="text-sm text-slate-600">Nessun tratto definito</span>
          )}
        </div>
        {isEditing && (
          <div className="mt-2 flex gap-2">
            <input
              value={newTrait}
              onChange={(e) => onNewTraitChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onAddTrait())}
              placeholder="Aggiungi tratto…"
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-3 py-1.5 text-sm text-slate-300 placeholder:text-slate-600 outline-none focus:border-violet-500/40"
            />
            <button
              onClick={onAddTrait}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-slate-400 hover:bg-[var(--overlay)]"
            >
              +
            </button>
          </div>
        )}
      </div>

      {/* Other fields */}
      {fields.map(({key, label, placeholder, multiline}) => {
        const value = (display as Record<string, unknown>)[key] as string ?? ''
        return (
          <div key={key}>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</h3>
            {isEditing ? (
              multiline ? (
                <textarea
                  value={(editForm as Record<string, unknown>)[key] as string ?? ''}
                  onChange={(e) => onFormChange({...editForm, [key]: e.target.value})}
                  placeholder={placeholder}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 outline-none focus:border-violet-500/40"
                />
              ) : (
                <input
                  value={(editForm as Record<string, unknown>)[key] as string ?? ''}
                  onChange={(e) => onFormChange({...editForm, [key]: e.target.value})}
                  placeholder={placeholder}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 outline-none focus:border-violet-500/40"
                />
              )
            ) : value ? (
              <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">{value}</p>
            ) : (
              <p className="text-sm italic text-slate-600">{placeholder}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Chapters Tab ─────────────────────────────────────────────────────────────

function ChaptersTab({character, allChapters}: {character: Character; allChapters: {id: string; title: string; number: number}[]}) {
  if (character.chaptersAppearing.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <BookUser className="h-10 w-10 text-slate-600" />
        <p className="text-sm text-slate-500">Nessuna apparizione registrata</p>
        <p className="text-xs text-slate-600">Esegui un'analisi capitolo con estrazione personaggi</p>
      </div>
    )
  }

  const sorted = [...character.chaptersAppearing].sort((a, b) => {
    const ca = allChapters.find((c) => c.id === a.chapterId)
    const cb = allChapters.find((c) => c.id === b.chapterId)
    return (ca?.number ?? 0) - (cb?.number ?? 0)
  })

  return (
    <div className="divide-y divide-[var(--border)]">
      {sorted.map((app, i) => {
        const chapter = allChapters.find((c) => c.id === app.chapterId)
        const cfg = CHARACTER_ROLE_CONFIG[app.role]
        return (
          <div key={i} className="p-5">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Cap. {chapter?.number ?? '?'}</span>
              <span className="font-medium text-sm text-[var(--text-primary)]">{app.chapterTitle || chapter?.title}</span>
              <span className={cn('ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium', cfg.bg, cfg.color)}>
                {cfg.label}
              </span>
            </div>
            {app.description && (
              <p className="text-sm leading-relaxed text-slate-400">{app.description}</p>
            )}
            {app.keyMoments && app.keyMoments.length > 0 && (
              <ul className="mt-2 space-y-1">
                {app.keyMoments.map((m, j) => (
                  <li key={j} className="flex items-start gap-2 text-xs text-slate-500">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-violet-500" />
                    {m}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Overview Panel ───────────────────────────────────────────────────────────

type AnalysisMap = Partial<Record<string, Partial<Record<AIProvider, CharacterAnalysis | null>>>>

function OverviewPanel({
  characters,
  allChapters,
  analyses,
  activeProvider,
  analyzingAll,
  view,
  onViewChange,
  onProviderChange,
  onAnalyzeAll,
  onSelect,
  onCreateNew,
}: {
  characters: Character[]
  allChapters: {id: string; title: string; number: number; status?: string}[]
  analyses: AnalysisMap
  activeProvider: AIProvider
  analyzingAll: boolean
  view: 'characters' | 'bychapter'
  onViewChange: (v: 'characters' | 'bychapter') => void
  onProviderChange: (p: AIProvider) => void
  onAnalyzeAll: () => void
  onSelect: (char: Character) => void
  onCreateNew: () => void
}) {
  const withAnalysis = characters.filter((c) => analyses[c.id]?.[activeProvider])
  const avgOverall =
    withAnalysis.length > 0
      ? withAnalysis.reduce((sum, c) => sum + (analyses[c.id]?.[activeProvider]?.scores.overall ?? 0), 0) /
        withAnalysis.length
      : null

  const sorted = [...characters].sort((a, b) => {
    const roleOrder = {protagonist: 0, antagonist: 1, secondary: 2, minor: 3}
    const rA = roleOrder[a.role as keyof typeof roleOrder] ?? 4
    const rB = roleOrder[b.role as keyof typeof roleOrder] ?? 4
    if (rA !== rB) return rA - rB
    const aScore = analyses[a.id]?.[activeProvider]?.scores.overall ?? -1
    const bScore = analyses[b.id]?.[activeProvider]?.scores.overall ?? -1
    return bScore - aScore
  })

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3 flex-wrap">
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex rounded-lg border border-[var(--border)] bg-[var(--overlay)] p-0.5">
            <button
              onClick={() => onViewChange('characters')}
              className={cn('rounded-md px-3 py-1 text-xs font-medium transition-colors', view === 'characters' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200')}
            >
              Personaggi
            </button>
            <button
              onClick={() => onViewChange('bychapter')}
              className={cn('rounded-md px-3 py-1 text-xs font-medium transition-colors', view === 'bychapter' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200')}
            >
              Per capitolo
            </button>
          </div>
          <p className="text-xs text-slate-500">
            {characters.length} personaggi
            {avgOverall != null && view === 'characters' && (
              <span className={cn('ml-1.5 font-semibold', scoreColor(avgOverall))}>· media {avgOverall.toFixed(1)}/10</span>
            )}
          </p>
        </div>
        {view === 'characters' && characters.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={activeProvider}
              onChange={(e) => onProviderChange(e.target.value as AIProvider)}
              className="rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-2.5 py-1 text-xs text-slate-300 outline-none focus:border-violet-500/40"
            >
              {Object.entries(AI_PROVIDER_CONFIG).map(([val, cfg]) => (
                <option key={val} value={val}>{cfg.icon} {cfg.label}</option>
              ))}
            </select>
            <button
              onClick={onAnalyzeAll}
              disabled={analyzingAll}
              className="flex items-center gap-1.5 rounded-lg border border-violet-700/40 bg-violet-600/20 px-3 py-1 text-xs font-medium text-violet-300 transition-colors hover:bg-violet-600/30 disabled:opacity-40"
            >
              {analyzingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Analizza tutti
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {characters.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--overlay)]">
              <Users className="h-8 w-8 text-slate-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Nessun personaggio</p>
              <p className="mt-1 text-xs text-slate-600">Crea il primo o esegui un'analisi capitolo con estrazione personaggi</p>
            </div>
            <button
              onClick={onCreateNew}
              className="flex items-center gap-2 rounded-lg border border-violet-700/40 bg-violet-600/20 px-4 py-2 text-sm text-violet-300 transition-colors hover:bg-violet-600/30"
            >
              <Plus className="h-4 w-4" />
              Crea personaggio
            </button>
          </div>
        ) : view === 'characters' ? (
          /* ── GRIGLIA PERSONAGGI ── */
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((char) => {
              const cfg = CHARACTER_ROLE_CONFIG[char.role]
              const analysis = analyses[char.id]?.[activeProvider] ?? null
              return (
                <button
                  key={char.id}
                  onClick={() => onSelect(char)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3.5 text-left transition-all hover:border-violet-500/30 hover:bg-violet-900/10"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm font-bold', cfg.bg, cfg.color, cfg.border)}>
                      {char.name[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{char.name}</span>
                        <span className={cn('shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium', cfg.bg, cfg.color, cfg.border)}>
                          {cfg.label}
                        </span>
                      </div>
                      {char.personalityTraits.length > 0 && (
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">
                          {char.personalityTraits.slice(0, 3).join(' · ')}
                        </p>
                      )}
                    </div>
                    {analysis ? (
                      <span className={cn('shrink-0 text-base font-bold tabular-nums', scoreColor(analysis.scores.overall))}>
                        {analysis.scores.overall.toFixed(1)}
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-slate-600">—</span>
                    )}
                  </div>
                  {/* Capitoli come pill */}
                  {char.chaptersAppearing.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {char.chaptersAppearing
                        .map((a) => allChapters.find((c) => c.id === a.chapterId))
                        .filter(Boolean)
                        .sort((a, b) => (a?.number ?? 0) - (b?.number ?? 0))
                        .slice(0, 5)
                        .map((c) => (
                          <span key={c!.id} className="rounded bg-[var(--overlay)] px-1.5 py-0.5 text-[10px] text-slate-500">
                            {c!.number}
                          </span>
                        ))}
                      {char.chaptersAppearing.length > 5 && (
                        <span className="text-[10px] text-slate-600">+{char.chaptersAppearing.length - 5}</span>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          /* ── VISTA PER CAPITOLO ── */
          <div className="space-y-2">
            {allChapters.length === 0 ? (
              <div className="py-12 text-center">
                <BookUser className="mx-auto mb-2 h-8 w-8 text-slate-600" />
                <p className="text-sm text-slate-500">Nessun capitolo disponibile</p>
              </div>
            ) : (
              allChapters
                .slice()
                .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
                .map((chapter) => {
                  const chapterChars = characters.filter((c) =>
                    c.chaptersAppearing.some((a) => a.chapterId === chapter.id)
                  )
                  return (
                    <div key={chapter.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden">
                      {/* Chapter header */}
                      <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--overlay)] px-4 py-2.5">
                        <span className="shrink-0 rounded bg-violet-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300">
                          Cap. {chapter.number}
                        </span>
                        <span className="flex-1 truncate text-sm font-medium text-[var(--text-primary)]">{chapter.title}</span>
                        <span className="shrink-0 text-[10px] text-slate-600">{chapterChars.length} pers.</span>
                      </div>
                      {/* Characters in chapter */}
                      {chapterChars.length === 0 ? (
                        <p className="px-4 py-3 text-xs italic text-slate-600">Nessun personaggio estratto per questo capitolo</p>
                      ) : (
                        <div className="flex flex-wrap gap-2 px-4 py-3">
                          {chapterChars.map((char) => {
                            const cfg = CHARACTER_ROLE_CONFIG[char.role]
                            const app = char.chaptersAppearing.find((a) => a.chapterId === chapter.id)
                            return (
                              <button
                                key={char.id}
                                onClick={() => onSelect(char)}
                                title={app?.description || char.name}
                                className={cn(
                                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:brightness-110',
                                  cfg.bg, cfg.color, cfg.border,
                                )}
                              >
                                <span className="font-bold">{char.name[0]?.toUpperCase()}</span>
                                {char.name}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Analysis Tab ─────────────────────────────────────────────────────────────

function AnalysisTab({
  analysis,
  activeProvider,
  triggering,
  pendingAnalysis,
  error,
  onProviderChange,
  onTrigger,
  onReload,
}: {
  analysis: CharacterAnalysis | null
  activeProvider: AIProvider
  triggering: boolean
  pendingAnalysis: boolean
  error: string | null
  onProviderChange: (p: AIProvider) => void
  onTrigger: () => void
  onReload: () => void
}) {
  return (
    <div className="p-6 space-y-5">
      {/* Provider + trigger */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={activeProvider}
          onChange={(e) => onProviderChange(e.target.value as AIProvider)}
          className="rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-violet-500/40"
        >
          {Object.entries(AI_PROVIDER_CONFIG).map(([val, cfg]) => (
            <option key={val} value={val}>{cfg.icon} {cfg.label}</option>
          ))}
        </select>
        <button
          onClick={onTrigger}
          disabled={triggering || pendingAnalysis}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
        >
          {triggering || pendingAnalysis ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {pendingAnalysis ? 'Analisi in corso…' : 'Analizza personaggio'}
        </button>
        {analysis && (
          <button onClick={onReload} className="rounded-lg border border-[var(--border)] p-1.5 text-slate-500 hover:bg-[var(--overlay)] hover:text-slate-300">
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Pending banner */}
      <AnimatePresence>
        {pendingAnalysis && (
          <motion.div
            initial={{opacity: 0, y: -4}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: -4}}
            className="flex items-center gap-3 rounded-xl border border-violet-800/40 bg-violet-900/20 px-4 py-3"
          >
            <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
            <div>
              <p className="text-sm font-medium text-violet-300">Analisi in esecuzione…</p>
              <p className="text-xs text-violet-400/70">Controllo automatico ogni 10 secondi</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-rose-800/40 bg-rose-900/20 px-4 py-3">
          <p className="text-sm font-medium text-rose-300">Errore analisi</p>
          <p className="mt-1 text-xs text-rose-400/80">{error}</p>
        </div>
      )}

      {/* No analysis yet */}
      {!analysis && !pendingAnalysis && !error && (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-12 text-center">
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-slate-600" />
          <p className="text-sm text-slate-500">Nessuna analisi disponibile</p>
          <p className="mt-1 text-xs text-slate-600">Clicca "Analizza personaggio" per ottenere una panoramica</p>
        </div>
      )}

      {/* Analysis results */}
      {analysis && (
        <motion.div
          initial={{opacity: 0, y: 8}}
          animate={{opacity: 1, y: 0}}
          className="space-y-5"
        >
          {/* Meta */}
          <p className="text-xs text-slate-600">
            {AI_PROVIDER_CONFIG[analysis.provider]?.icon} {AI_PROVIDER_CONFIG[analysis.provider]?.label} · {analysis.model} · {formatRelativeDate(analysis.analyzedAt)}
          </p>

          {/* Scores */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Punteggi</h4>
            <div className="space-y-2">
              {(Object.keys(CHARACTER_SCORE_LABELS) as (keyof typeof CHARACTER_SCORE_LABELS)[]).map((key) => (
                <ScoreBar key={key} label={CHARACTER_SCORE_LABELS[key]} value={analysis.scores[key] ?? 0} />
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--overlay)] px-4 py-3">
              <span className="text-sm font-medium text-slate-300">Complessivo</span>
              <span className={cn('text-2xl font-bold tabular-nums', scoreColor(analysis.scores.overall))}>
                {analysis.scores.overall.toFixed(1)}
                <span className="text-sm text-slate-500">/10</span>
              </span>
            </div>
          </div>

          {/* Overview */}
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Panoramica</h4>
            <p className="text-sm leading-relaxed text-slate-300">{analysis.overview}</p>
          </div>

          {/* Arc */}
          {analysis.arc && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Arco del personaggio</h4>
              <p className="text-sm leading-relaxed text-slate-300">{analysis.arc}</p>
            </div>
          )}

          {/* Strengths */}
          {analysis.strengths?.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-500/70">Punti di forza</h4>
              <ul className="space-y-1.5">
                {analysis.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Weaknesses */}
          {analysis.weaknesses?.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-500/70">Debolezze</h4>
              <ul className="space-y-1.5">
                {analysis.weaknesses.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Consistency issues */}
          {analysis.consistencyIssues?.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-rose-500/70">Problemi di coerenza</h4>
              <div className="space-y-2">
                {analysis.consistencyIssues.map((issue, i) => (
                  <div key={i} className="rounded-lg border border-rose-900/40 bg-rose-900/10 px-3 py-2.5">
                    {issue.chapterTitle && (
                      <p className="mb-1 text-xs font-medium text-rose-400">{issue.chapterTitle}</p>
                    )}
                    <p className="text-sm text-slate-300">{issue.issue}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions */}
          {analysis.suggestions?.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-violet-400/70">Suggerimenti</h4>
              <ul className="space-y-1.5">
                {analysis.suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Chapters breakdown */}
          {analysis.chaptersBreakdown?.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Per capitolo</h4>
              <div className="space-y-2">
                {analysis.chaptersBreakdown.map((cb, i) => (
                  <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--overlay)] px-3 py-2.5">
                    <p className="mb-1 text-xs font-medium text-slate-400">{cb.chapterTitle}</p>
                    <p className="text-sm text-slate-300">{cb.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
