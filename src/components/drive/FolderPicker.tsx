import {useEffect, useRef, useState} from 'react'
import {ChevronDown, Folder, Loader2, Search} from 'lucide-react'
import {useDriveStore} from '@/stores/driveStore'
import {useAuthStore} from '@/stores/authStore'
import {getValidAccessToken, listDriveFolders} from '@/services/driveAuthService'
import {toast} from '@/stores/toastStore'
import type {DriveFile} from '@/types'
import {cn} from '@/utils/cn'

export default function FolderPicker() {
  const { user } = useAuthStore()
  const { config, setFolder, patchTokens } = useDriveStore()
  const [open, setOpen] = useState(false)
  const [folders, setFolders] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) { setSearch(''); return }
    void loadFolders()
    setTimeout(() => searchRef.current?.focus(), 50)
  }, [open])

  async function loadFolders() {
    if (!config || !user) return
    setLoading(true)
    try {
      const { accessToken, updatedTokens } = await getValidAccessToken(config, user.uid)
      if (updatedTokens) await patchTokens(user.uid, updatedTokens)
      const list = await listDriveFolders(accessToken)
      setFolders(list)
    } catch (err) {
      toast.error('Errore caricamento cartelle: ' + (err as Error).message)
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  async function handleSelect(folder: DriveFile) {
    if (!user) return
    try {
      await setFolder(user.uid, folder.id, folder.name)
      toast.success(`Cartella "${folder.name}" selezionata`)
      setOpen(false)
    } catch {
      toast.error('Errore salvataggio cartella')
    }
  }

  if (!config) return null

  const currentName = config.folderName || 'Nessuna cartella selezionata'

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
          config.folderId
            ? 'border-white/8 bg-white/4 text-slate-200 hover:border-white/15'
            : 'border-amber-700/40 bg-amber-900/10 text-amber-400 hover:bg-amber-900/20',
        )}
      >
        <Folder className="h-4 w-4 shrink-0" />
        <span className="max-w-[200px] truncate">{currentName}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-xl border border-white/10 bg-[#1A1A26] shadow-2xl">
            {/* Search input */}
            <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca cartella..."
                className="flex-1 bg-transparent text-sm text-slate-300 placeholder-slate-600 outline-none"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-slate-600 hover:text-slate-400">×</button>
              )}
            </div>
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Caricamento cartelle...
              </div>
            ) : (() => {
              const filtered = folders.filter((f) =>
                f.name.toLowerCase().includes(search.toLowerCase())
              )
              return filtered.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">
                  {search ? `Nessuna cartella trovata per "${search}"` : 'Nessuna cartella trovata su Drive'}
                </p>
              ) : (
                <ul className="max-h-64 overflow-y-auto py-1">
                  {filtered.map((f) => (
                    <li key={f.id}>
                      <button
                        onClick={() => handleSelect(f)}
                        className={cn(
                          'flex w-full items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-white/6',
                          config.folderId === f.id ? 'text-violet-400' : 'text-slate-300',
                        )}
                      >
                        <Folder className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                        <span className="truncate">{f.name}</span>
                        {config.folderId === f.id && (
                          <span className="ml-auto text-xs text-violet-400">✓</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            })()}
          </div>
        </>
      )}
    </div>
  )
}
