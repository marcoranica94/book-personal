import {useEffect} from 'react'
import {HashRouter, Navigate, Route, Routes} from 'react-router-dom'
import {useAuthStore} from '@/stores/authStore'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import Layout from '@/components/layout/Layout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import KanbanPage from '@/pages/KanbanPage'
import ChapterPage from '@/pages/ChapterPage'
import AnalysisPage from '@/pages/AnalysisPage'
import SettingsPage from '@/pages/SettingsPage'

export default function App() {
  const { initialize } = useAuthStore()

  useEffect(() => {
    void initialize()
  }, [initialize])

  return (
    <HashRouter>
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
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </HashRouter>
  )
}
