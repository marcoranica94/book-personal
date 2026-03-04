import {useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {AnimatePresence, motion} from 'framer-motion'
import {BookOpen, CheckCircle2, Github, Loader2} from 'lucide-react'
import {useAuthStore} from '@/stores/authStore'

type LoginStep = 'idle' | 'signing_in' | 'done' | 'error'

export default function LoginPage() {
  const navigate = useNavigate()
  const {signIn, isAuthenticated} = useAuthStore()

  const [step, setStep] = useState<LoginStep>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', {replace: true})
  }, [isAuthenticated, navigate])

  async function handleLogin() {
    setStep('signing_in')
    setError('')
    try {
      await signIn()
      setStep('done')
      setTimeout(() => navigate('/dashboard', {replace: true}), 800)
    } catch (err) {
      const msg = (err as Error).message ?? ''
      if (msg.includes('popup-closed') || msg.includes('cancelled')) {
        setStep('idle')
      } else {
        setStep('error')
        setError(msg || 'Errore sconosciuto')
      }
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
        initial={{opacity: 0, y: 24}}
        animate={{opacity: 1, y: 0}}
        transition={{duration: 0.45, ease: 'easeOut'}}
        className="relative z-10 w-full max-w-sm px-4"
      >
        {/* Logo */}
        <div className="mb-8 text-center">
          <motion.div
            initial={{scale: 0.8, opacity: 0}}
            animate={{scale: 1, opacity: 1}}
            transition={{delay: 0.1}}
            className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-900/30 shadow-lg shadow-violet-500/20"
          >
            <BookOpen className="h-8 w-8 text-violet-400" />
          </motion.div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Book Dashboard</h1>
          <p className="mt-2 text-sm text-slate-400">Il tuo studio di scrittura personale</p>
        </div>

        {/* Card */}
        <motion.div
          initial={{opacity: 0, y: 16}}
          animate={{opacity: 1, y: 0}}
          transition={{delay: 0.15}}
          className="rounded-2xl border border-white/8 bg-white/4 p-8 shadow-2xl backdrop-blur-sm"
        >
          <AnimatePresence mode="wait">

            {/* ── IDLE / ERROR ── */}
            {(step === 'idle' || step === 'error') && (
              <motion.div
                key="idle"
                initial={{opacity: 0}}
                animate={{opacity: 1}}
                exit={{opacity: 0}}
                className="space-y-6"
              >
                <div className="text-center">
                  <h2 className="text-lg font-semibold text-white">Accedi con GitHub</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Si aprirà una finestra per autorizzare l'accesso
                  </p>
                </div>

                {error && (
                  <div className="rounded-xl border border-red-500/30 bg-red-900/20 px-3 py-2.5 text-sm text-red-300">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleLogin}
                  className="flex w-full items-center justify-center gap-3 rounded-xl bg-white py-3.5 text-sm font-semibold text-gray-900 transition-all hover:bg-gray-100 hover:shadow-lg active:scale-[0.98]"
                >
                  <Github className="h-5 w-5" />
                  Accedi con GitHub
                </button>
              </motion.div>
            )}

            {/* ── SIGNING IN ── */}
            {step === 'signing_in' && (
              <motion.div
                key="signing_in"
                initial={{opacity: 0}}
                animate={{opacity: 1}}
                exit={{opacity: 0}}
                className="flex flex-col items-center gap-4 py-6"
              >
                <Loader2 className="h-10 w-10 animate-spin text-violet-400" />
                <p className="text-sm text-slate-400">Apertura finestra GitHub...</p>
              </motion.div>
            )}

            {/* ── DONE ── */}
            {step === 'done' && (
              <motion.div
                key="done"
                initial={{opacity: 0, scale: 0.9}}
                animate={{opacity: 1, scale: 1}}
                exit={{opacity: 0}}
                className="flex flex-col items-center gap-4 py-6"
              >
                <motion.div
                  initial={{scale: 0}}
                  animate={{scale: 1}}
                  transition={{type: 'spring', stiffness: 400, damping: 20}}
                >
                  <CheckCircle2 className="h-12 w-12 text-emerald-400" />
                </motion.div>
                <p className="font-semibold text-white">Accesso effettuato!</p>
              </motion.div>
            )}

          </AnimatePresence>
        </motion.div>

        <p className="mt-5 text-center text-xs text-slate-700">
          La sessione è gestita da Firebase Auth · I dati restano privati
        </p>
      </motion.div>
    </div>
  )
}
