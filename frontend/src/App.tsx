import { useEffect, useState } from 'react'
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import {
  Archive, ChevronRight, Database, Globe, LayoutDashboard, LogOut, Mail,
  Menu, Settings as SettingsIcon, ShieldCheck, X,
} from 'lucide-react'
import { api } from './api'
import Login from './pages/Login'
import Setup from './pages/Setup'
import Dashboard from './pages/Dashboard'
import Sites from './pages/Sites'
import SiteDetail from './pages/SiteDetail'
import DatabasePage from './pages/Database'
import Backups from './pages/Backups'
import MailPage from './pages/Mail'
import Security from './pages/Security'
import Settings from './pages/Settings'

interface AuthState {
  checked: boolean
  authenticated: boolean
  setupRequired: boolean
}

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ checked: false, authenticated: false, setupRequired: false })

  useEffect(() => {
    (async () => {
      try {
        const s = await api<{ authenticated: boolean; setupRequired: boolean }>('/auth/status')
        let authenticated = false
        if (!s.setupRequired) {
          try {
            await api('/system/metrics')
            authenticated = true
          } catch { authenticated = false }
        }
        setAuth({ checked: true, authenticated, setupRequired: s.setupRequired })
      } catch {
        setAuth({ checked: true, authenticated: false, setupRequired: false })
      }
    })()
  }, [])

  if (!auth.checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="flex items-center gap-3 text-slate-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-600" />
          Loading…
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/setup" element={auth.setupRequired && !auth.authenticated ? <Setup /> : <Navigate to="/" replace />} />
      <Route path="/login" element={!auth.authenticated ? <Login /> : <Navigate to="/" replace />} />
      <Route
        path="/"
        element={auth.authenticated ? <Layout /> : <Navigate to={auth.setupRequired ? '/setup' : '/login'} replace />}
      >
        <Route index element={<Dashboard />} />
        <Route path="sites" element={<Sites />} />
        <Route path="sites/:id" element={<SiteDetail />} />
        <Route path="database" element={<DatabasePage />} />
        <Route path="backups" element={<Backups />} />
        <Route path="mail" element={<MailPage />} />
        <Route path="security" element={<Security />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

const NAV_GROUPS = [
  {
    label: 'Hosting',
    items: [
      { to: '/sites', label: 'Sites', icon: Globe, desc: 'Manage websites & apps' },
      { to: '/database', label: 'Databases', icon: Database, desc: 'MariaDB management' },
      { to: '/mail', label: 'Mail', icon: Mail, desc: 'Email domains & webmail' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/backups', label: 'Backups', icon: Archive, desc: 'Scheduled restore points' },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/security', label: 'Security', icon: ShieldCheck, desc: 'Password & 2FA' },
      { to: '/settings', label: 'Settings', icon: SettingsIcon, desc: 'Hostname, SSL, alerts' },
    ],
  },
]

function Layout() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  const isActive = (to: string): boolean =>
    to === '/sites' ? pathname.startsWith('/sites') : pathname === to

  const sidebarContent = (
    <>
      <div className="flex items-center gap-2.5 border-b border-white/10 px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-xs font-bold text-slate-900">NP</span>
        <div>
          <p className="text-sm font-semibold leading-tight text-white">NimbusPanel</p>
          <p className="text-[11px] leading-tight text-slate-500">Lightweight Hosting</p>
        </div>
      </div>

      {/* Dashboard link (top-level) */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <Link
          to="/"
          onClick={() => setOpen(false)}
          className={`mb-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
            pathname === '/'
              ? 'bg-emerald-500/10 font-medium text-emerald-400'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          <span className="flex-1">Dashboard</span>
        </Link>

        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-1">
            <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              {group.label}
            </p>
            {group.items.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  isActive(to)
                    ? 'bg-emerald-500/10 font-medium text-emerald-400'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{label}</span>
                {isActive(to) && <ChevronRight className="h-3 w-3 text-emerald-500/50" />}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <button
        onClick={async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); location.href = '/login' }}
        className="mx-3 mb-4 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </>
  )

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-slate-900 lg:flex">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-slate-900">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <span className="text-sm font-semibold text-white">NimbusPanel</span>
              <button onClick={() => setOpen(false)} className="text-slate-400"><X className="h-5 w-5" /></button>
            </div>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Mobile header */}
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <button onClick={() => setOpen(true)} className="text-slate-600"><Menu className="h-5 w-5" /></button>
        <span className="font-semibold text-slate-900">NimbusPanel</span>
      </div>

      <main className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8 lg:pl-[17rem]">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
