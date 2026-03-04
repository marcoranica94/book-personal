import {useEffect, useState} from 'react'
import {motion} from 'framer-motion'
import {Loader2, Save} from 'lucide-react'
import {useSettingsStore} from '@/stores/settingsStore'
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

const inputCls =
  'w-full rounded-lg border border-white/8 bg-white/4 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/50'

export default function SettingsPage() {
  const { settings, loadSettings, saveSettings, isSaving } = useSettingsStore()
  const [form, setForm] = useState<BookSettings>(settings)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    setForm(settings)
  }, [settings])

  function update<K extends keyof BookSettings>(key: K, value: BookSettings[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    await saveSettings(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Impostazioni</h1>
        <p className="mt-1 text-sm text-slate-400">Configura le informazioni del tuo libro</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-white/8 bg-[#12121A] p-6 space-y-5"
      >
        <h2 className="text-sm font-semibold text-slate-300">Informazioni Libro</h2>

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

        <Field label="Sinossi">
          <textarea
            className={`${inputCls} min-h-[80px] resize-y`}
            value={form.synopsis}
            onChange={(e) => update('synopsis', e.target.value)}
            placeholder="Breve descrizione del libro..."
          />
        </Field>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-white/8 bg-[#12121A] p-6 space-y-5"
      >
        <h2 className="text-sm font-semibold text-slate-300">Parametri Dashboard</h2>

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
      </motion.div>

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
