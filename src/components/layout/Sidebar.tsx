import {NavLink} from 'react-router-dom'
import {AnimatePresence, motion} from 'framer-motion'
import {BookOpen, ChevronLeft, ChevronRight, Kanban, LayoutDashboard, LogOut, Settings, Sparkles,} from 'lucide-react'
import {useAuthStore} from '@/stores/authStore'
import {useUIStore} from '@/stores/uiStore'
import {useSettingsStore} from '@/stores/settingsStore'
import {useChaptersStore} from '@/stores/chaptersStore'
import {calcProgress} from '@/utils/formatters'
import {cn} from '@/utils/cn'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/kanban', icon: Kanban, label: 'Kanban' },
  { to: '/analysis', icon: Sparkles, label: 'Analisi AI' },
  { to: '/settings', icon: Settings, label: 'Impostazioni' },
]

export default function Sidebar() {
  const { user, logout } = useAuthStore()
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const { settings } = useSettingsStore()
  const { totalWords } = useChaptersStore()
  const progress = calcProgress(totalWords(), settings.targetWords)

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 64 : 220 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="relative flex h-full flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)]"
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 border-b border-[var(--border)] px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600/80">
          <BookOpen className="h-4 w-4 text-white" />
        </div>
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden text-sm font-semibold text-[var(--text-primary)] whitespace-nowrap"
            >
              {settings.title || 'Book Dashboard'}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2 py-3">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition-all',
                isActive
                  ? 'bg-violet-600/20 text-violet-300'
                  : 'text-slate-400 hover:bg-[var(--overlay)] hover:text-slate-200'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn(
                    'h-5 w-5 shrink-0 transition-colors',
                    isActive ? 'text-violet-400' : 'text-slate-500 group-hover:text-slate-300'
                  )}
                />
                <AnimatePresence>
                  {!sidebarCollapsed && (
                    <motion.span
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.15 }}
                      className="whitespace-nowrap"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Progress mini-bar */}
      <div className="border-t border-[var(--border)] px-3 py-3">
        {sidebarCollapsed ? (
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs font-medium text-slate-600">{progress}%</span>
            <div className="w-2 rounded-full bg-[var(--overlay)]" style={{height: 32}}>
              <div
                className="w-full rounded-full bg-violet-500/50 transition-all duration-700"
                style={{height: `${progress}%`}}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">Progresso libro</span>
              <span className="font-medium text-slate-500">{progress}%</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-[var(--overlay)]">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-violet-600 to-cyan-500"
                animate={{width: `${progress}%`}}
                transition={{duration: 0.8, ease: 'easeOut'}}
              />
            </div>
          </div>
        )}
      </div>

      {/* User + logout */}
      <div className="border-t border-[var(--border)] p-2">
        <div className="flex items-center gap-2 rounded-lg p-2">
          {user?.photoURL && (
            <img
              src={user.photoURL}
              alt={user.displayName ?? ''}
              className="h-7 w-7 shrink-0 rounded-full ring-1 ring-[var(--border-strong)]"
            />
          )}
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="min-w-0 flex-1"
              >
                <p className="truncate text-xs font-medium text-slate-300">
                  {user?.displayName ?? user?.email ?? 'Utente'}
                </p>
                <p className="truncate text-xs text-slate-600">{user?.email ?? ''}</p>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={logout}
            title="Logout"
            className="shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-red-900/30 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-16 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--bg-sidebar)] text-slate-500 transition-colors hover:text-slate-300"
      >
        {sidebarCollapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5" />
        )}
      </button>
    </motion.aside>
  )
}
