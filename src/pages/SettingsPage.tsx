import {useEffect, useState} from 'react'
import {motion} from 'framer-motion'
import {Download, ExternalLink, Loader2, LogOut, Save, User} from 'lucide-react'
import {useSettingsStore} from '@/stores/settingsStore'
import {useAuthStore} from '@/stores/authStore'
import {useChaptersStore} from '@/stores/chaptersStore'
import {toast} from '@/stores/toastStore'
import type {BookSettings} from '@/types'

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
      className="rounded-xl border border-white/8 bg-[#12121A] p-6 space-y-5"
    >
      <h2 className="text-sm font-semibold text-slate-300">{title}</h2>
      {children}
    </motion.div>
  )
}

const inputCls =
  'w-full rounded-lg border border-white/8 bg-white/4 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/50'

export default function SettingsPage() {
  const {settings, loadSettings, saveSettings, isSaving} = useSettingsStore()
  const {user, logout} = useAuthStore()
  const {chapters} = useChaptersStore()
  const [form, setForm] = useState<BookSettings>(settings)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

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
        <h1 className="text-2xl font-bold text-white">Impostazioni</h1>
        <p className="mt-1 text-sm text-slate-400">Configura le informazioni del tuo libro</p>
      </div>

      {/* Account */}
      <Section title="Account GitHub" delay={0}>
        <div className="flex items-center gap-4">
          {user?.avatar_url && (
            <img
              src={user.avatar_url}
              alt={user.login}
              className="h-12 w-12 rounded-full border border-white/10"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-white">{user?.name ?? user?.login}</p>
            <p className="text-sm text-slate-500">@{user?.login}</p>
          </div>
          <a
            href={`https://github.com/${user?.login}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-white/8 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
          >
            <User className="h-3.5 w-3.5" />
            Profilo
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="border-t border-white/6 pt-4">
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

        <div className="grid grid-cols-2 gap-4">
          <Field label="Genere">
            <input
              className={inputCls}
              value={form.genre}
              onChange={(e) => update('genre', e.target.value)}
              placeholder="es. Fantasy, Thriller..."
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

      {/* Data export */}
      <Section title="Dati e Export" delay={0.15}>
        <p className="text-sm text-slate-400">
          Scarica un backup completo dei tuoi capitoli e impostazioni in formato JSON.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-lg border border-white/8 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <Download className="h-4 w-4" />
            Esporta JSON ({chapters.length} capitoli)
          </button>
        </div>
      </Section>

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
