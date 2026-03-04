import {motion} from 'framer-motion'
import {Sparkles} from 'lucide-react'

export default function AnalysisPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        <Sparkles className="mx-auto mb-3 h-12 w-12 text-slate-600" />
        <p className="text-slate-400 font-medium">Analisi AI</p>
        <p className="text-xs text-slate-600 mt-1">In arrivo — Sprint 4</p>
      </motion.div>
    </div>
  )
}
