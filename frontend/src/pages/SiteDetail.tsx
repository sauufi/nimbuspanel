import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ChevronLeft, ExternalLink, FileText, FolderOpen, GitBranch,
  Lock, Settings2, Terminal,
} from 'lucide-react'
import { api } from '../api'
import FilesBrowser from '../components/FilesBrowser'

interface Site {
  id: number
  domain: string
  type: 'php' | 'node'
  php_version: string | null
  node_port: number | null
  ssl_enabled: number
  created_at: string
  web_server?: string
  deploy_secret?: string | null
  repo_url: string | null
  branch: string | null
  node_version: string | null
  build_cmd: string | null
  start_cmd: string | null
}

interface Detail {
  site: Site
  docroot: string
  sslDir: string
  service: { unit: string; active: boolean }
  node?: { unit: string; currentRelease: string | null }
}

type Tab = 'overview' | 'files' | 'deploy' | 'env' | 'logs' | 'rules'

export default function SiteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [nodeVersions, setNodeVersions] = useState<string[]>([])
  const [tab, setTab] = useState<Tab>('overview')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState<'ssl' | 'delete' | 'deploy' | 'rollback' | 'settings' | 'env' | null>(null)
  const [deployOutput, setDeployOutput] = useState('')
  const [purge, setPurge] = useState(false)
  const [confirmDomain, setConfirmDomain] = useState('')

  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('main')
  const [nodeVersion, setNodeVersion] = useState('')
  const [buildCmd, setBuildCmd] = useState('')
  const [startCmd, setStartCmd] = useState('node index.js')
  const [envText, setEnvText] = useState('')

  async function load() {
    try {
      const d = await api<Detail>(`/sites/${id}`)
      setDetail(d)
      setError('')
      if (d.site.type === 'node') {
        setRepoUrl(d.site.repo_url ?? '')
        setBranch(d.site.branch ?? 'main')
        let nv = d.site.node_version
        if (!nv) {
          nv = nodeVersions[0]
          if (!nv) { try { nv = (await api<{ nodeVersions: string[] }>('/sites/options')).nodeVersions[0] ?? '' } catch { nv = '' } }
        }
        setNodeVersion(nv)
        setBuildCmd(d.site.build_cmd ?? '')
        setStartCmd(d.site.start_cmd ?? 'node index.js')
        try { const env = await api<{ env: string }>(`/sites/${id}/env`); setEnvText(env.env) } catch { /* */ }
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load') }
  }

  useEffect(() => {
    api<{ nodeVersions: string[] }>('/sites/options').then((o) => setNodeVersions(o.nodeVersions)).catch(() => {})
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function act(kind: 'ssl' | 'deploy' | 'rollback' | 'settings' | 'env', fn: () => Promise<unknown>, okMsg?: string) {
    setBusy(kind); setError(''); setNotice('')
    try { await fn(); if (okMsg) setNotice(okMsg); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed') }
    finally { setBusy(null) }
  }

  async function deploy() {
    setBusy('deploy'); setError(''); setNotice('')
    setDeployOutput('Deploying… (can take 1-3 minutes)')
    try {
      const res = await api<{ output: string }>(`/sites/${id}/deploy`, { method: 'POST' })
      setDeployOutput(res.output); setNotice('Deploy succeeded'); await load()
    } catch (err) { setDeployOutput(''); setError(err instanceof Error ? err.message : 'Deploy failed') }
    finally { setBusy(null) }
  }

  async function remove() {
    setBusy('delete'); setError('')
    try { await api(`/sites/${id}?purge=${purge ? '1' : '0'}`, { method: 'DELETE' }); navigate('/sites') }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); setBusy(null) }
  }

  const [wpCreds, setWpCreds] = useState<{ installUrl?: string; credentials?: { dbName: string; dbUser: string; dbPass: string; dbHost: string } } | null>(null)

  async function installWordPress() {
    if (!confirm('Install WordPress on this site? The docroot must be empty — existing index.html will be replaced.')) return
    setBusy('deploy'); setError(''); setNotice('')
    try {
      const res = await api<{ ok: boolean; installUrl?: string; credentials?: { dbName: string; dbUser: string; dbPass: string; dbHost: string } }>(`/sites/${id}/wordpress`, { method: 'POST', body: '{}' })
      setWpCreds(res)
      setNotice('WordPress installed — credentials below')
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'WordPress install failed') }
    finally { setBusy(null) }
  }

  if (error && !detail) return <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
  if (!detail) return <p className="text-slate-500">Loading…</p>

  const { site, docroot, service } = detail
  const url = `http${site.ssl_enabled ? 's' : ''}://${site.domain}`
  const isNode = site.type === 'node'
  const isNginxPhp = site.type === 'php' && site.web_server !== 'apache'

  const tabs: { key: Tab; label: string; icon: React.ReactNode; show: boolean }[] = [
    { key: 'overview', label: 'Overview', icon: <Settings2 className="h-3.5 w-3.5" />, show: true },
    { key: 'files', label: 'Files', icon: <FolderOpen className="h-3.5 w-3.5" />, show: true },
    { key: 'deploy', label: 'Deploy', icon: <GitBranch className="h-3.5 w-3.5" />, show: isNode },
    { key: 'env', label: 'Env Vars', icon: <FileText className="h-3.5 w-3.5" />, show: isNode },
    { key: 'logs', label: 'Logs', icon: <Terminal className="h-3.5 w-3.5" />, show: isNode },
    { key: 'rules', label: 'URL Rules', icon: <FileText className="h-3.5 w-3.5" />, show: isNginxPhp },
  ]
  const visibleTabs = tabs.filter((t) => t.show)

  return (
    <div className="space-y-4">
      {/* Breadcrumb + header */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
        <button onClick={() => navigate('/sites')} className="flex items-center gap-1 hover:text-slate-600">
          <ChevronLeft className="h-4 w-4" /> Sites
        </button>
        <span className="text-slate-300">/</span>
        <span className="font-mono font-medium text-slate-700">{site.domain}</span>
        <a href={url} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-xs text-emerald-600 hover:underline">
          <ExternalLink className="h-3 w-3" /> open
        </a>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-1 overflow-x-auto">
          {visibleTabs.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors ${
                tab === key
                  ? 'border-emerald-600 font-medium text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== OVERVIEW ===== */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Info label="Type" value={site.type.toUpperCase()} />
            <Info label="Runtime" value={isNode ? `Node ${site.node_version} · port ${site.node_port}` : `PHP ${site.php_version} (FPM)`} />
            {site.type === 'php' && <Info label="Web server" value={site.web_server === 'apache' ? 'Apache (.htaccess active)' : 'nginx direct'} />}
            {isNode && detail.node && (
              <Info label="systemd unit" value={`${detail.node.unit} — ${service.active ? '●' : '○'} ${service.active ? 'active' : 'stopped'}`}
                className={service.active ? 'text-emerald-700' : 'text-red-700'} />
            )}
            {isNode && detail.node && <Info label="Active release" value={detail.node.currentRelease ?? 'no deploy yet'} mono />}
            <Info label="SSL" value={site.ssl_enabled ? '● active (Let\u2019s Encrypt)' : '○ not issued'} className={site.ssl_enabled ? 'text-emerald-700' : ''} />
            <Info label="Document root" value={docroot} mono />
            <Info label="Created" value={site.created_at.replace('T', ' ').slice(0, 19)} />
          </div>

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Actions</h2>
            <div className="flex flex-wrap gap-3">
              {!site.ssl_enabled && (
                <button
                  onClick={() => act('ssl', () => api(`/sites/${id}/ssl`, { method: 'POST' }), 'Certificate installed')}
                  disabled={busy !== null}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  <Lock className="h-4 w-4" /> {busy === 'ssl' ? 'Issuing…' : 'Issue SSL (Let\u2019s Encrypt)'}
                </button>
              )}
              {site.type === 'php' && (
                <>
                  <button
                    onClick={installWordPress}
                    disabled={busy !== null}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                  >
                    {busy === 'deploy' ? 'Installing WordPress…' : 'Install WordPress'}
                  </button>
                  <button
                    onClick={async () => {
                      setBusy('deploy'); setError(''); setNotice('')
                      try { const res = await api<{ output: string }>(`/sites/${id}/adminer`, { method: 'POST' }); setNotice(res.output) }
                      catch (err) { setError(err instanceof Error ? err.message : 'Adminer install failed') }
                      finally { setBusy(null) }
                    }}
                    disabled={busy !== null}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    {busy === 'deploy' ? 'Installing…' : 'Install Adminer'}
                  </button>
                </>
              )}
            </div>
            {!site.ssl_enabled && <p className="text-xs text-slate-400">Make sure the domain's DNS already points to this server before issuing SSL.</p>}
          </section>

          {wpCreds?.credentials && (
            <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-blue-900">WordPress Installed 🎉</h2>
                {wpCreds.installUrl && (
                  <a href={wpCreds.installUrl} target="_blank" rel="noreferrer"
                    className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500">
                    Complete setup →
                  </a>
                )}
              </div>
              <p className="text-xs text-blue-700">Database credentials (also saved in the Databases page):</p>
              <pre className="overflow-auto rounded-lg border border-blue-200 bg-white p-3 font-mono text-xs text-slate-700">{`Database: ${wpCreds.credentials.dbName}
User:     ${wpCreds.credentials.dbUser}
Password: ${wpCreds.credentials.dbPass}
Host:     ${wpCreds.credentials.dbHost}`}</pre>
              <p className="text-xs text-blue-600">Open the "Complete setup" link to pick your WordPress admin username &amp; password.</p>
            </section>
          )}

          <section className="space-y-3 rounded-xl border border-red-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-red-700">Delete site</h2>
            <p className="text-sm text-slate-500">
              The vhost, pool/unit, and site user are removed. Without “destroy data”, the site folder is moved to{' '}
              <span className="font-mono text-xs">/var/www/&lt;domain&gt;.removed-*</span>.
            </p>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={purge} onChange={(e) => setPurge(e.target.checked)} className="accent-red-600" />
              Permanently destroy site data
            </label>
            <input
              className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              placeholder={`Type ${site.domain} to confirm`}
              value={confirmDomain} onChange={(e) => setConfirmDomain(e.target.value)}
            />
            <button onClick={remove} disabled={busy !== null || confirmDomain !== site.domain}
              className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-40">
              {busy === 'delete' ? 'Deleting…' : 'Delete Site'}
            </button>
          </section>
        </div>
      )}

      {/* ===== FILES ===== */}
      {tab === 'files' && <FilesBrowser siteKey={site.id} />}

      {/* ===== DEPLOY ===== */}
      {tab === 'deploy' && isNode && (
        <div className="space-y-6">
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Deploy Settings</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Repository (public https or local path)">
                <input className={inputCls} value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/user/app.git" />
              </Field>
              <Field label="Branch"><input className={inputCls} value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" /></Field>
              <Field label="Node version">
                <select className={inputCls} value={nodeVersion} onChange={(e) => setNodeVersion(e.target.value)}>
                  {nodeVersions.length === 0 && <option value="">— none —</option>}
                  {nodeVersions.map((v) => <option key={v} value={v}>Node {v}</option>)}
                </select>
              </Field>
              <Field label="Start command"><input className={inputCls} value={startCmd} onChange={(e) => setStartCmd(e.target.value)} placeholder="node dist/index.js" /></Field>
              <div className="sm:col-span-2">
                <Field label="Build command (optional)"><input className={inputCls} value={buildCmd} onChange={(e) => setBuildCmd(e.target.value)} placeholder="npm run build" /></Field>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button disabled={busy !== null} onClick={() => act('settings', () => api(`/sites/${id}/settings`, { method: 'PUT', body: JSON.stringify({ repoUrl, branch, nodeVersion, buildCmd, startCmd }) }), 'Settings saved')}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {busy === 'settings' ? 'Saving…' : 'Save Settings'}
              </button>
              <button disabled={busy !== null} onClick={deploy}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                {busy === 'deploy' ? 'Deploying…' : '▲ Deploy Now'}
              </button>
              <button disabled={busy !== null} onClick={() => act('rollback', () => api(`/sites/${id}/rollback`, { method: 'POST' }), 'Rollback complete')}
                className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50">
                ↩ Rollback previous release
              </button>
            </div>
            {deployOutput && <pre className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-4 text-xs leading-relaxed text-slate-200">{deployOutput}</pre>}
          </section>
          <WebhookBox siteKey={site.id} secret={site.deploy_secret ?? null} onRotated={load} busy={busy !== null} />
        </div>
      )}

      {/* ===== ENV ===== */}
      {tab === 'env' && isNode && (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Environment Variables</h2>
          <p className="text-xs text-slate-400">KEY=value per line, written to shared/.env. PORT &amp; NODE_ENV are set automatically.</p>
          <textarea className="h-64 w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs text-slate-800 outline-none focus:border-emerald-500"
            value={envText} onChange={(e) => setEnvText(e.target.value)} placeholder={'DATABASE_URL=mysql://...\nAPI_KEY=...'} />
          <button onClick={() => act('env', () => api(`/sites/${id}/env`, { method: 'PUT', body: JSON.stringify({ env: envText }) }), '.env saved (deploy/restart to apply)')} disabled={busy !== null}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {busy === 'env' ? 'Saving…' : 'Save .env'}
          </button>
        </section>
      )}

      {/* ===== LOGS ===== */}
      {tab === 'logs' && isNode && detail.node && <LogViewer siteKey={site.id} unit={detail.node.unit} />}

      {/* ===== RULES ===== */}
      {tab === 'rules' && isNginxPhp && <RulesEditor siteKey={site.id} />}
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'

function Info({ label, value, mono, className = '' }: { label: string; value: string; mono?: boolean; className?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-sm ${mono ? 'font-mono text-slate-600' : 'text-slate-800'} ${className}`}>{value}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>{children}</div>
}

function RulesEditor({ siteKey }: { siteKey: number }) {
  const [rules, setRules] = useState('')
  const [htInput, setHtInput] = useState('')
  const [convNotes, setConvNotes] = useState<string[]>([])
  const [kind, setKind] = useState<'redirect301' | 'redirect302' | 'rewrite' | 'denyFile' | 'denyPattern'>('redirect301')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { api<{ rules: string }>(`/sites/${siteKey}/rules`).then((r) => setRules(r.rules)).catch(() => {}) }, [siteKey])

  async function convert() {
    setBusy(true); setError(''); setNotice('')
    try {
      const res = await api<{ nginx: string; notes: string[]; warnings: string[] }>(`/sites/${siteKey}/htaccess-convert`, { method: 'POST', body: JSON.stringify({ content: htInput }) })
      setRules(res.nginx); setConvNotes([...res.warnings, ...res.notes]); setNotice('Converted — review below, then Save')
    } catch (err) { setError(err instanceof Error ? err.message : 'Conversion failed') } finally { setBusy(false) }
  }

  function addRule() {
    const f = from.trim(); const t = to.trim()
    if (!f) return setError('"From" is required')
    const esc = (s: string): string => s.replace(/[.+*?()[\]{}|^$\\]/g, '\\$&')
    let line = ''
    switch (kind) {
      case 'redirect301': if (!t) return setError('"To" is required'); line = `rewrite ^${esc(f)}/?$ ${t} permanent;`; break
      case 'redirect302': if (!t) return setError('"To" is required'); line = `rewrite ^${esc(f)}/?$ ${t} redirect;`; break
      case 'rewrite': if (!t) return setError('"To" is required'); line = `rewrite ^${f}$ ${t} last;`; break
      case 'denyFile': line = `location = ${f.startsWith('/') ? f : `/${f}`} { deny all; }`; break
      case 'denyPattern': line = `location ~ ${f} { deny all; }`; break
    }
    setRules((r) => (r.trim() ? `${r.replace(/\n$/, '')}\n${line}\n` : `${line}\n`))
    setFrom(''); setTo(''); setError(''); setNotice('Rule appended — click Save to apply')
  }

  async function save() {
    setBusy(true); setError(''); setNotice('')
    try { await api(`/sites/${siteKey}/rules`, { method: 'PUT', body: JSON.stringify({ rules }) }); setNotice('Rules saved & applied') }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed') } finally { setBusy(false) }
  }

  const kindOptions = [['redirect301', '301 redirect'], ['redirect302', '302 redirect'], ['rewrite', 'Internal rewrite'], ['denyFile', 'Deny exact file'], ['denyPattern', 'Deny regex pattern']] as const

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">URL Rules (nginx)</h2>
      <p className="text-xs text-slate-400">Custom rewrites/redirects/deny rules. Convert .htaccess or add manually — validated with <span className="font-mono">nginx -t</span>.</p>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

      <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Convert .htaccess</p>
          <textarea className="h-28 w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs outline-none focus:border-emerald-500"
            value={htInput} onChange={(e) => setHtInput(e.target.value)} placeholder={'RewriteEngine On\nRewriteRule ^old$ new.php [L]\nRedirect 301 /old /new'} />
          <button onClick={convert} disabled={busy || !htInput.trim()} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-40">⇄ Convert</button>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Add a rule manually</p>
          <select className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {kindOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs outline-none focus:border-emerald-500"
            placeholder={kind === 'denyFile' ? '/secret.txt' : '^/old-page$'} value={from} onChange={(e) => setFrom(e.target.value)} />
          {kind !== 'denyFile' && kind !== 'denyPattern' && (
            <input className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs outline-none focus:border-emerald-500"
              placeholder="/new-page" value={to} onChange={(e) => setTo(e.target.value)} />
          )}
          <button onClick={addRule} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40">+ Append</button>
        </div>
      </div>

      {convNotes.length > 0 && <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{convNotes.map((n, i) => <li key={i}>• {n}</li>)}</ul>}

      <textarea className="h-48 w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs leading-relaxed outline-none focus:border-emerald-500"
        value={rules} onChange={(e) => setRules(e.target.value)} placeholder="# nginx rules — rewrite / location / error_page" />
      <button onClick={save} disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
        {busy ? 'Saving…' : 'Save Rules'}
      </button>
    </section>
  )
}

function WebhookBox({ siteKey, secret, onRotated, busy }: { siteKey: number; secret: string | null; onRotated: () => Promise<void>; busy: boolean }) {
  const [showSecret, setShowSecret] = useState(false)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const hookUrl = `${location.origin}/api/hooks/${siteKey}`

  async function rotate() {
    setWorking(true); setError('')
    try { await api(`/sites/${siteKey}/webhook-secret`, { method: 'POST' }); await onRotated() }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed') } finally { setWorking(false) }
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Deploy Webhook</h2>
      <p className="text-xs text-slate-400">Push to the configured branch triggers a deploy automatically. GitHub: Settings → Webhooks — Payload URL below, Content type <span className="font-mono">application/json</span>, Secret below.</p>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Payload URL</p>
        <pre className="overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-xs text-emerald-700">{hookUrl}</pre></div>
      <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Secret</p>
        {secret ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="overflow-auto rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 font-mono text-xs text-slate-700">{showSecret ? secret : '•'.repeat(Math.min(32, secret.length))}</code>
            <button onClick={() => setShowSecret((v) => !v)} className="text-xs text-slate-500 hover:text-slate-700">{showSecret ? 'hide' : 'show'}</button>
          </div>
        ) : <p className="text-xs text-slate-400">No secret yet — generate one to activate.</p>}
        <button onClick={rotate} disabled={busy || working} className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {working ? 'Generating…' : secret ? 'Rotate secret' : 'Generate secret'}
        </button>
      </div>
    </section>
  )
}

function LogViewer({ siteKey, unit }: { siteKey: number; unit: string }) {
  const [connected, setConnected] = useState(false)
  const [lines, setLines] = useState<string[]>([])
  const esRef = useRef<EventSource | null>(null)
  const boxRef = useRef<HTMLPreElement | null>(null)

  function connect() {
    setLines([`[panel] connecting to journal ${unit}…`])
    const es = new EventSource(`/api/sites/${siteKey}/logs`)
    esRef.current = es
    es.onopen = () => setConnected(true)
    es.onmessage = (ev) => {
      setLines((prev) => [...prev, ...ev.data.split('\n')].slice(-500))
      requestAnimationFrame(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight })
    }
    es.onerror = () => setConnected(false)
  }

  function disconnect() { esRef.current?.close(); esRef.current = null; setConnected(false); setLines((p) => [...p, '[panel] disconnected']) }
  useEffect(() => () => esRef.current?.close(), [])

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Live Logs ({unit})</h2>
        <span className={`flex items-center gap-1.5 text-xs font-medium ${connected ? 'text-emerald-700' : 'text-slate-400'}`}>
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />{connected ? 'connected' : 'disconnected'}
        </span>
      </div>
      <pre ref={boxRef} className="h-72 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-300">
        {lines.length ? lines.join('\n') : 'Click "Connect" to stream application logs in real time.'}
      </pre>
      <div className="flex gap-3">
        {connected ? (
          <button onClick={disconnect} className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100">Disconnect</button>
        ) : (
          <button onClick={connect} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Connect</button>
        )}
        <button onClick={() => setLines([])} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50">Clear</button>
      </div>
    </section>
  )
}
