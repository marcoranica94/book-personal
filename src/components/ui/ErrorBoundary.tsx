import type {ReactNode} from 'react'
import {Component} from 'react'
import {AlertTriangle, RefreshCw} from 'lucide-react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = {error: null}

  static getDerivedStateFromError(error: Error): State {
    return {error}
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--bg-base)] p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/30 bg-red-900/20">
          <AlertTriangle className="h-8 w-8 text-red-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Qualcosa è andato storto</h1>
          <p className="mt-2 max-w-sm text-sm text-slate-500">
            Si è verificato un errore inatteso. Ricarica la pagina per riprendere.
          </p>
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-xs text-slate-600 hover:text-slate-400">
              Dettagli errore
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-[var(--overlay)] p-3 text-xs text-red-400">
              {this.state.error.message}
              {'\n'}
              {this.state.error.stack}
            </pre>
          </details>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
        >
          <RefreshCw className="h-4 w-4" />
          Ricarica la pagina
        </button>
      </div>
    )
  }
}
