import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, Database, Globe, HardDrive, Mail, MemoryStick, ShieldCheck, Timer } from 'lucide-react'
import { api, fmtUptime } from '../api'

interface Metrics {
  mem: { totalMb: number; usedMb: number; usedPct: number }
  swap: { totalMb: number; freeMb: number }
  load: [number, number, number]
  cores: number
  uptimeSec: number
  disk: { totalGb: number; freeGb: number } | null
  hostname: string
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [services, setServices] = useState<{ unit: string; active: boolean }[]>([])
  const [siteCount, setSiteCount] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function refresh() {
    try {
      const [m, s, sites] = await Promise.all([
        api<Metrics>('/system/metrics'),
        api<{ services: { unit: string; active: boolean }[] }>('/system/services'),
        api<{ sites: unknown[] }>('/sites'),
      ])
      setMetrics(m)
      setServices(s.services)
      setSiteCount(sites.sites.length)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    }
  }

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 15_000)
    return () => clearInterval(t)
  }, [])

  if (error) return <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
  if (!metrics) return <p className="text-slate-500">Loading…</p>

  const diskPct = metrics.disk ? Math.round(((metrics.disk.totalGb - metrics.disk.freeGb) / metrics.disk.totalGb) * 100) : 0
  const stopped = services.filter((s) => !s.active)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-0.5 text-sm text-slate-500">{metrics.hostname} — refreshed every 15s</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<MemoryStick className="h-4 w-4" />} title="Memory" value={`${metrics.mem.usedMb} / ${metrics.mem.totalMb} MB`} pct={metrics.mem.usedPct} />
        <StatCard icon={<HardDrive className="h-4 w-4" />} title="Disk" value={metrics.disk ? `${metrics.disk.freeGb} GB free of ${metrics.disk.totalGb} GB` : 'unavailable'} pct={diskPct} />
        <StatCard icon={<Timer className="h-4 w-4" />} title="Uptime" value={fmtUptime(metrics.uptimeSec)} pct={null} sub={`${metrics.cores} core${metrics.cores > 1 ? 's' : ''} · load ${metrics.load[0].toFixed(2)}`} />
        <StatCard
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Services"
          value={`${services.length - stopped.length}/${services.length} active`}
          pct={services.length ? Math.round(((services.length - stopped.length) / services.length) * 100) : null}
          tone={stopped.length ? 'warn' : 'ok'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Services */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Services</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {services.map((s) => (
              <div key={s.unit} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <span className="font-mono text-sm text-slate-700">{s.unit}</span>
                <span className={`flex items-center gap-1.5 text-xs font-medium ${s.active ? 'text-emerald-700' : 'text-red-700'}`}>
                  <span className={`h-2 w-2 rounded-full ${s.active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  {s.active ? 'active' : 'stopped'}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Quick links */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Quick access</h2>
          <div className="space-y-2">
            <Tile to="/sites" icon={<Globe className="h-4 w-4" />} label="Sites" hint={siteCount !== null ? `${siteCount} configured` : '…'} />
            <Tile to="/database" icon={<Database className="h-4 w-4" />} label="Databases" hint="MariaDB" />
            <Tile to="/backups" icon={<Archive className="h-4 w-4" />} label="Backups" hint="Scheduled daily" />
            <Tile to="/mail" icon={<Mail className="h-4 w-4" />} label="Mail" hint="Domains · Webmail" />
          </div>
        </section>
      </div>
    </div>
  )
}

function StatCard({ icon, title, value, pct, sub, tone = 'ok' }: {
  icon: React.ReactNode; title: string; value: string; pct: number | null; sub?: string; tone?: 'ok' | 'warn'
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <p className="text-xs font-semibold uppercase tracking-wide">{title}</p>
      </div>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
      {pct !== null && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-emerald-500'}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      )}
      {sub && <p className="mt-2 text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

function Tile({ to, icon, label, hint }: { to: string; icon: React.ReactNode; label: string; hint: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 transition hover:border-emerald-200 hover:bg-emerald-50">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-emerald-600 shadow-sm">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        <span className="block text-xs text-slate-400">{hint}</span>
      </span>
    </Link>
  )
}
