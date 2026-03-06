import {useEffect} from 'react'
import {HashRouter, Navigate, Route, Routes} from 'react-router-dom'
import {useAuthStore} from '@/stores/authStore'
import {useDriveStore} from '@/stores/driveStore'
import {useUIStore} from '@/stores/uiStore'
import {handleDriveOAuthCallback} from '@/services/driveAuthService'
import {toast} from '@/stores/toastStore'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import Layout from '@/components/layout/Layout'
import ScrollToTop from '@/components/ScrollToTop'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import KanbanPage from '@/pages/KanbanPage'
import ChapterPage from '@/pages/ChapterPage'
import AnalysisPage from '@/pages/AnalysisPage'
import SettingsPage from '@/pages/SettingsPage'
import ReportsPage from '@/pages/ReportsPage'
import EditorPage from '@/pages/EditorPage'

export default function App() {
  const {initialize, user, isLoading} = useAuthStore()
  const {theme} = useUIStore()

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }, [theme])

  useEffect(() => {
    // initialize() registra onAuthStateChanged e restituisce l'unsubscribe
    const unsubscribe = initialize()
    return unsubscribe
  }, [initialize])

  // Gestisce il callback OAuth di Google Drive (?code=...&state=...)
  useEffect(() => {
    if (isLoading) return
    if (!user) return

    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    if (!code || !state) return

    // Pulisce subito i query params dall'URL
    window.history.replaceState({}, '', window.location.pathname + window.location.hash)

    void (async () => {
      try {
        const tokens = await handleDriveOAuthCallback(code, state, user.uid)
        await useDriveStore.getState().saveInitialConfig(user.uid, tokens)
        toast.success('Google Drive connesso! Ora seleziona la cartella.')
        // Naviga alle impostazioni per far selezionare la cartella
        window.location.hash = '#/settings'
      } catch (err) {
        toast.error('Errore connessione Drive: ' + (err as Error).message)
      }
    })()
  }, [user, isLoading])

  return (
    <ErrorBoundary>
    <HashRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="kanban" element={<KanbanPage />} />
          <Route path="chapters/:id" element={<ChapterPage />} />
          <Route path="analysis" element={<AnalysisPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="editor/:id" element={<EditorPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </HashRouter>
    </ErrorBoundary>
  )
}
