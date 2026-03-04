import {useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {AnimatePresence, motion} from 'framer-motion'
import {BookOpen, CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, Loader2, RefreshCw} from 'lucide-react'
import {useAuthStore} from '@/stores/authStore'

type LoginStep = 'idle' | 'verifying' | 'done' | 'error'

const STEPS = [
  {
    n: 1,
    text: 'Vai su',
    link: { label: 'github.com/settings/tokens', href: 'https://github.com/settings/tokens/new' },
    after: '',
  },
  { n: 2, text: 'Clicca "Generate new token (classic)"', link: null, after: '' },
  {
    n: 3,
    text: 'Spunta lo scope',
    link: null,
    badge: 'repo',
    after: 'e genera il token',
  },
  { n: 4, text: 'Incolla il token qui sotto', link: null, after: '' },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const { setToken, isAuthenticated } = useAuthStore()

  const [step, setStep] = useState<LoginStep>('idle')
  const [token, setTokenInput] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, navigate])

  async function handleLogin() {
    const t = token.trim()
    if (!t) { setError('Incolla il tuo Personal Access Token'); return }
    if (!t.startsWith('ghp_') && !t.startsWith('github_pat_')) {
      setError('Il token deve iniziare con "ghp_" o "github_pat_"')
      return
    }
    setStep('verifying')
    setError('')
    try {
      await setToken(t)
      setStep('done')
      setTimeout(() => navigate('/dashboard', { replace: true }), 900)
    } catch {
      setStep('error')
      setError('Token non valido o senza permessi "repo". Riprova.')
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0A0A0F]">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-900/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[300px] w-[300px] rounded-full bg-cyan-900/10 blur-[100px]" />
      </div>

      {/* Grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(#7C3AED 1px, transparent 1px), linear-gradient(90deg, #7C3AED 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md px-4"
      >
        {/* Logo */}
        <div className="mb-8 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-900/30 shadow-lg shadow-violet-500/20"
          >
            <BookOpen className="h-8 w-8 text-violet-400" />
          </motion.div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Book Dashboard</h1>
          <p className="mt-2 text-sm text-slate-400">Il tuo studio di scrittura personale</p>
        </div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-white/8 bg-white/4 p-7 shadow-2xl backdrop-blur-sm"
        >
          <AnimatePresence mode="wait">

            {/* ── IDLE / ERROR ── */}
            {(step === 'idle' || step === 'error') && (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">

                <div>
                  <h2 className="text-lg font-semibold text-white">Accedi con GitHub</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Usa un Personal Access Token per autenticarti
                  </p>
                </div>

                {/* Steps */}
                <ol className="space-y-2.5">
                  {STEPS.map(({ n, text, link, badge, after }) => (
                    <li key={n} className="flex items-start gap-3 text-sm text-slate-400">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-900/50 text-xs font-semibold text-violet-400">
                        {n}
                      </span>
                      <span>
                        {text}{' '}
                        {link && (
                          <a
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-violet-400 underline-offset-2 hover:underline"
                          >
                            {link.label}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {badge && (
                          <code className="mx-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-emerald-400">
                            {badge}
                          </code>
                        )}
                        {after}
                      </span>
                    </li>
                  ))}
                </ol>

                {/* Token input */}
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                  <input
                    type={showToken ? 'text' : 'password'}
                    className="w-full rounded-xl border border-white/8 bg-white/4 py-3 pl-10 pr-10 font-mono text-sm text-white placeholder-slate-700 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    value={token}
                    onChange={(e) => { setTokenInput(e.target.value); setError('') }}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Error */}
                {error && (
                  <div className="rounded-xl border border-red-500/30 bg-red-900/20 px-3 py-2.5 text-sm text-red-300">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleLogin}
                  disabled={!token.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white transition-all hover:bg-violet-500 hover:shadow-lg hover:shadow-violet-500/25 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <KeyRound className="h-4 w-4" />
                  Accedi
                </button>

                {step === 'error' && (
                  <button
                    onClick={() => { setStep('idle'); setError(''); setTokenInput('') }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/8 py-2 text-sm text-slate-500 hover:text-slate-300"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Riprova
                  </button>
                )}
              </motion.div>
            )}

            {/* ── VERIFYING ── */}
            {step === 'verifying' && (
              <motion.div key="verifying" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="h-12 w-12 animate-spin text-violet-400" />
                <p className="text-sm text-slate-400">Verifica token in corso...</p>
              </motion.div>
            )}

            {/* ── DONE ── */}
            {step === 'done' && (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4 py-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  <CheckCircle2 className="h-14 w-14 text-emerald-400" />
                </motion.div>
                <p className="text-base font-semibold text-white">Accesso effettuato!</p>
                <p className="text-sm text-slate-400">Caricamento dashboard...</p>
              </motion.div>
            )}

          </AnimatePresence>
        </motion.div>

        <p className="mt-5 text-center text-xs text-slate-700">
          Il token viene salvato solo nel tuo browser · I dati restano nel tuo repo GitHub
        </p>
      </motion.div>
    </div>
  )
}
