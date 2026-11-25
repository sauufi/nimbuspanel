import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Globe, Lock, Plus, Server } from 'lucide-react'
import { api } from '../api'

interface Site {
  id: number
  domain: string
  type: 'php' | 'node'
  php_version: string | null
  node_port: number | null
  ssl_enabled: number
  web_server?: string
  created_at: string
}

interface DiskUsage {
  domain: string
  sizeMb: string
}

export default function Sites() {
  const [sites, setSites] = useState<Site[] | null>(null)
  const [diskUsage, setDiskUsage] = useState<Record<string, string>>({})
  const [phpVersions, setPhpVersions] = useState<string[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [domain, setDomain] = useState('')
  const [type, setType] = useState<'php' | 'node'>('php')
  const [phpVersion, setPhpVersion] = useState('')
  const [webServer, setWebServer] = useState<'nginx' | 'apache'>('nginx')
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const [s, o, d] = await Promise.all([
        api<{ sites: Site[] }>('/sites'),
        api<{ phpVersions: string[] }>('/sites/options'),
        api<{ sites: DiskUsage[] }>('/sites/disk-usage').catch(() => ({ sites: [] as DiskUsage[] })),
      ])
      setSites(s.sites)
      setPhpVersions(o.phpVersions)
      const usageMap: Record<string, string> = {}
      for (const u of d.sites) usageMap[u.domain] = u.sizeMb
      setDiskUsage(usageMap)
      if (o.phpVersions.length > 0 && !phpVersion) setPhpVersion(o.phpVersions[o.phpVersions.length - 1])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sites')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function createSite(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api('/sites', {
        method: 'POST',
        body: JSON.stringify({
          domain: domain.trim().toLowerCase(),
          type,
          phpVersion: type === 'php' ? phpVersion : undefined,
          webServer: type === 'php' ? webServer : 'nginx',
        }),
      })
      setNotice(`Site ${domain} created & active`)
      setDomain('')
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create site')
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Sites</h1>
          <p className="mt-0.5 text-sm text-slate-500">Websites and applications hosted on this server</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          <Plus className="h-4 w-4" />
          {showForm ? 'Cancel' : 'Add Site'}
        </button>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      {showForm && (
        <form onSubmit={createSite} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Domain <span className="font-normal text-slate-400">(DNS must already point to this server)</span></label>
            <input className={inputCls} placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} required />
          </div>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="radio" checked={type === 'php'} onChange={() => setType('php')} className="accent-emerald-600" /> PHP
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="radio" checked={type === 'node'} onChange={() => setType('node')} className="accent-emerald-600" /> Node.js
            </label>
          </div>
          {type === 'php' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">PHP version</label>
                <select className={inputCls} value={phpVersion} onChange={(e) => setPhpVersion(e.target.value)}>
                  {phpVersions.map((v) => <option key={v} value={v}>PHP {v}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Web server</label>
                <select className={inputCls} value={webServer} onChange={(e) => setWebServer(e.target.value as 'nginx' | 'apache')}>
                  <option value="nginx">nginx — lightweight</option>
                  <option value="apache">Apache — .htaccess compatible</option>
                </select>
                <p className="mt-1.5 text-xs text-slate-400">
                  Apache runs behind an nginx proxy — .htaccess files work as-is. WordPress permalinks work in both modes.
                </p>
              </div>
            </div>
          )}
          {type === 'node' && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
              A proxy vhost is created with an automatically allocated internal port.
              After creating the site, open its detail page to configure the Git
              repository and run the first deploy.
            </p>
          )}
          <button disabled={busy} className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
            {busy ? 'Creating…' : 'Create Site'}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Domain</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Runtime</th>
              <th className="px-5 py-3">Disk</th>
              <th className="px-5 py-3">SSL</th>
              <th className="px-5 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(sites ?? []).map((s) => (
              <tr key={s.id} className="transition hover:bg-slate-50">
                <td className="px-5 py-3.5">
                  <Link to={`/sites/${s.id}`} className="flex items-center gap-2 font-medium text-emerald-700 hover:text-emerald-600 hover:underline">
                    <Globe className="h-4 w-4 text-slate-300" />
                    {s.domain}
                  </Link>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.type === 'php' ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {s.type.toUpperCase()}
                  </span>
                  {s.type === 'php' && s.web_server === 'apache' && (
                    <span className="ml-1.5 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">.htaccess</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-slate-600">
                  {s.type === 'php' ? `PHP ${s.php_version}` : `port ${s.node_port}`}
                </td>
                <td className="px-5 py-3.5">
                  {diskUsage[s.domain] ? (
                    <span className={`text-xs font-medium ${
                      Number(diskUsage[s.domain]) > 500 ? 'text-red-600' :
                      Number(diskUsage[s.domain]) > 100 ? 'text-amber-600' : 'text-slate-500'
                    }`}>
                      {Number(diskUsage[s.domain]) >= 1000
                        ? `${(Number(diskUsage[s.domain]) / 1024).toFixed(1)} GB`
                        : `${diskUsage[s.domain]} MB`}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  {s.ssl_enabled ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><Lock className="h-3.5 w-3.5" /> active</span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-slate-400">{s.created_at.slice(0, 10)}</td>
              </tr>
            ))}
            {sites !== null && sites.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                  <Server className="mx-auto mb-2 h-8 w-8 text-slate-200" />
                  No sites yet — click “Add Site”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
