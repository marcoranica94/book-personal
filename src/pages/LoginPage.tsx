import {useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {AnimatePresence, motion} from 'framer-motion'
import {BookOpen, CheckCircle2, ExternalLink, Github, Loader2, RefreshCw} from 'lucide-react'
import {pollForToken, requestDeviceCode} from '@/services/githubOAuth'
import {useAuthStore} from '@/stores/authStore'

type LoginStep = 'idle' | 'requesting' | 'waiting' | 'verifying' | 'done' | 'error'

export default function LoginPage() {
  const navigate = useNavigate()
  const { setToken, isAuthenticated } = useAuthStore()

  const [step, setStep] = useState<LoginStep>('idle')
  const [userCode, setUserCode] = useState('')
  const [verificationUrl, setVerificationUrl] = useState('')
  const [error, setError] = useState('')
  const [pollAttempt, setPollAttempt] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, navigate])

  async function handleLogin() {
    setStep('requesting')
    setError('')
    try {
      const deviceData = await requestDeviceCode()
      setUserCode(deviceData.user_code)
      setVerificationUrl(deviceData.verification_uri)
      setStep('waiting')

      const token = await pollForToken(
        deviceData.device_code,
        deviceData.interval,
        (attempt) => setPollAttempt(attempt)
      )

      setStep('verifying')
      await setToken(token)
      setStep('done')
      setTimeout(() => navigate('/dashboard', { replace: true }), 800)
    } catch (err) {
      setStep('error')
      setError((err as Error).message)
    }
  }

  async function copyCode() {
    await navigator.clipboard.writeText(userCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const progressPct = Math.min(100, (pollAttempt / 60) * 100)

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0A0A0F]">
      {/* Ambient background glow */}
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
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md px-4"
      >
        {/* Logo */}
        <div className="mb-10 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-900/30 shadow-lg shadow-violet-500/20"
          >
            <BookOpen className="h-8 w-8 text-violet-400" />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-3xl font-bold tracking-tight text-white"
          >
            Book Dashboard
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-2 text-sm text-slate-400"
          >
            Il tuo studio di scrittura personale
          </motion.p>
        </div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="rounded-2xl border border-white/8 bg-white/4 p-8 shadow-2xl backdrop-blur-sm"
        >
          <AnimatePresence mode="wait">
            {/* ── IDLE ── */}
            {step === 'idle' && (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <div className="space-y-2 text-center">
                  <h2 className="text-xl font-semibold text-white">Accedi al tuo spazio</h2>
                  <p className="text-sm text-slate-400">
                    Autenticazione sicura tramite GitHub
                  </p>
                </div>

                <ul className="space-y-3">
                  {[
                    'Kanban board per i tuoi capitoli',
                    'Statistiche e andamento del libro',
                    'Analisi AI per ogni capitolo',
                  ].map((feat) => (
                    <li key={feat} className="flex items-center gap-3 text-sm text-slate-300">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-400">
                        ✓
                      </span>
                      {feat}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={handleLogin}
                  className="flex w-full items-center justify-center gap-3 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-violet-500 hover:shadow-lg hover:shadow-violet-500/25 active:scale-[0.98]"
                >
                  <Github className="h-5 w-5" />
                  Accedi con GitHub
                </button>
              </motion.div>
            )}

            {/* ── REQUESTING ── */}
            {step === 'requesting' && (
              <motion.div
                key="requesting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4 py-4"
              >
                <Loader2 className="h-10 w-10 animate-spin text-violet-400" />
                <p className="text-sm text-slate-400">Contatto GitHub...</p>
              </motion.div>
            )}

            {/* ── WAITING ── */}
            {step === 'waiting' && (
              <motion.div
                key="waiting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <div className="text-center">
                  <h2 className="text-lg font-semibold text-white">Apri GitHub e inserisci il codice</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Vai su{' '}
                    <a
                      href={verificationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-violet-400 underline-offset-2 hover:underline"
                    >
                      github.com/login/device
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                </div>

                {/* Code display */}
                <div
                  onClick={copyCode}
                  className="group relative cursor-pointer rounded-xl border border-violet-500/30 bg-violet-900/20 p-4 text-center transition-colors hover:border-violet-500/60"
                >
                  <p className="font-mono text-3xl font-bold tracking-[0.25em] text-white">
                    {userCode}
                  </p>
                  <p className="mt-2 text-xs text-slate-500 group-hover:text-slate-400">
                    {copied ? '✓ Copiato!' : 'Clicca per copiare'}
                  </p>
                </div>

                {/* Polling progress */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      In attesa di autorizzazione...
                    </span>
                    <span>{Math.round(progressPct)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                    <motion.div
                      className="h-full bg-gradient-to-r from-violet-600 to-cyan-500"
                      initial={{ width: '0%' }}
                      animate={{ width: `${progressPct}%` }}
                      transition={{ ease: 'linear' }}
                    />
                  </div>
                </div>

                <button
                  onClick={() => {
                    setStep('idle')
                    setPollAttempt(0)
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/8 py-2 text-sm text-slate-400 transition-colors hover:text-slate-200"
                >
                  <RefreshCw className="h-4 w-4" />
                  Annulla e riprova
                </button>
              </motion.div>
            )}

            {/* ── VERIFYING ── */}
            {step === 'verifying' && (
              <motion.div
                key="verifying"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4 py-4"
              >
                <Loader2 className="h-10 w-10 animate-spin text-cyan-400" />
                <p className="text-sm text-slate-400">Verifica in corso...</p>
              </motion.div>
            )}

            {/* ── DONE ── */}
            {step === 'done' && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4 py-4"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  <CheckCircle2 className="h-14 w-14 text-emerald-400" />
                </motion.div>
                <p className="text-base font-medium text-white">Accesso effettuato!</p>
                <p className="text-sm text-slate-400">Caricamento dashboard...</p>
              </motion.div>
            )}

            {/* ── ERROR ── */}
            {step === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-5"
              >
                <div className="rounded-xl border border-red-500/30 bg-red-900/20 p-4 text-sm text-red-300">
                  {error}
                </div>
                <button
                  onClick={() => {
                    setStep('idle')
                    setError('')
                    setPollAttempt(0)
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-violet-500"
                >
                  <RefreshCw className="h-4 w-4" />
                  Riprova
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <p className="mt-6 text-center text-xs text-slate-600">
          I tuoi dati sono archiviati nel tuo repository GitHub
        </p>
      </motion.div>
    </div>
  )
}
