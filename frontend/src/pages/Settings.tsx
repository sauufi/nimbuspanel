import { useEffect, useState } from 'react'
import { Check, ExternalLink, Globe, GitBranch, Lock, Mail, Trash2, X } from 'lucide-react'
import { api } from '../api'

interface HostStatus {
  mode: 'none' | 'ip' | 'domain'
  hostname: string
  ssl: 'no' | 'pending' | 'yes'
  webmail: boolean
}

export default function Settings() {
  const [status, setStatus] = useState<HostStatus | null>(null)
  const [hostname, setHostname] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState<'save' | 'ssl' | null>(null)

  async function load() {
    try {
      const st = await api<HostStatus>('/panel-host')
      setStatus(st)
      setHostname(st.mode === 'domain' ? st.hostname : '')
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy('save')
    setError('')
    setNotice('')
    try {
      const res = await api<{ message?: string; sslPending?: boolean }>('/panel-host', {
        method: 'POST',
        body: JSON.stringify({ hostname: hostname.trim().toLowerCase() }),
      })
      setNotice(res.message ?? 'Saved')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  async function retrySsl() {
    setBusy('ssl')
    setError('')
    setNotice('')
    try {
      const res = await api<{ message?: string }>('/panel-host/ssl', { method: 'POST' })
      setNotice(res.message ?? 'SSL issued')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  if (!status) return <p className="text-slate-500">Loading…</p>

  const inputCls =
    'w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-0.5 text-sm text-slate-500">Panel access and notifications</p>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Panel Hostname &amp; SSL</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><Globe className="h-3.5 w-3.5" /> Access</p>
            <p className="mt-1.5 text-sm font-medium text-slate-800">
              {status.mode === 'domain' ? 'Hostname (domain)' : status.mode === 'ip' ? 'Server IP (default)' : 'Not configured'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><Lock className="h-3.5 w-3.5" /> SSL</p>
            <p className={`mt-1.5 flex items-center gap-1.5 text-sm font-medium ${status.ssl === 'yes' ? 'text-emerald-700' : status.ssl === 'pending' ? 'text-amber-600' : 'text-slate-500'}`}>
              <span className={`h-2 w-2 rounded-full ${status.ssl === 'yes' ? 'bg-emerald-500' : status.ssl === 'pending' ? 'bg-amber-400' : 'bg-slate-300'}`} />
              {status.ssl === 'yes' ? 'active (Let\u2019s Encrypt)' : status.ssl === 'pending' ? 'pending (DNS not ready?)' : 'none (HTTP)'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><Mail className="h-3.5 w-3.5" /> Webmail</p>
            <p className="mt-1.5 text-sm font-medium text-slate-800">
              {status.webmail ? (
                <>● <a href="/webmail/" target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">/webmail ↗</a></>
              ) : '○ not installed'}
            </p>
          </div>
        </div>

        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Panel hostname</label>
            <div className="flex flex-wrap gap-2">
              <input
                className={inputCls}
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="panel.example.com — leave empty for IP-only access"
              />
              <button
                disabled={busy !== null}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy === 'save' ? 'Applying…' : 'Save & Apply'}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Point the domain's DNS A record to this server <strong>before</strong> saving with a hostname — SSL
              (Let's Encrypt) is issued automatically and the panel + webmail are served at
              <span className="font-mono"> https://&lt;hostname&gt;</span>. Leave empty to serve the panel on
              <span className="font-mono"> http://&lt;server-ip&gt;/</span> only. A timestamped backup of the previous
              vhost is kept on the server.
            </p>
          </div>
        </form>

        {status.mode === 'domain' && status.ssl !== 'yes' && (
          <button
            onClick={retrySsl}
            disabled={busy !== null}
            className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
          >
            <Lock className="h-4 w-4" />
            {busy === 'ssl' ? 'Issuing…' : 'Retry SSL issuance'}
          </button>
        )}
      </section>

      <GitCredentialsSection />
      <NotificationsSection />
    </div>
  )
}

function GitCredentialsSection() {
  const [configured, setConfigured] = useState(false)
  const [hint, setHint] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState<'save' | 'remove' | 'check' | null>(null)

  async function load() {
    try {
      const res = await api<{ configured: boolean; hint: string }>('/git-token')
      setConfigured(res.configured)
      setHint(res.hint)
    } catch { /* ignore */ }
  }

  useEffect(() => { load() }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!token.trim()) return setError('Paste your GitHub token')
    setBusy('save')
    setError('')
    setNotice('')
    try {
      const res = await api<{ ok: boolean; message?: string; warning?: string }>('/git-token', {
        method: 'PUT',
        body: JSON.stringify({ token: token.trim() }),
      })
      setNotice(res.warning ?? res.message ?? 'Token saved')
      setToken('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally { setBusy(null) }
  }

  async function remove() {
    if (!confirm('Remove the GitHub token? Private repos will no longer be accessible during deploy.')) return
    setBusy('remove')
    setError('')
    setNotice('')
    try {
      await api('/git-token', { method: 'DELETE' })
      setNotice('Token removed')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove')
    } finally { setBusy(null) }
  }

  async function checkToken() {
    setBusy('check')
    setError('')
    setNotice('')
    try {
      const res = await api<{ message: string }>('/git-token/check', { method: 'POST' })
      setNotice(res.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed')
    } finally { setBusy(null) }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-xs text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <GitBranch className="h-4 w-4 text-slate-400" /> Git Credentials (Private Repos)
        </h2>
        {configured && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <Check className="h-3.5 w-3.5" /> configured ({hint})
          </span>
        )}
      </div>

      {!configured ? (
        <>
          {/* Step-by-step guide */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="mb-3 text-sm font-medium text-blue-900">How to create a GitHub token (2 minutes):</p>
            <ol className="space-y-2.5 text-sm text-blue-800">
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">1</span>
                <span>Go to <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline">GitHub Settings → Fine-grained tokens <ExternalLink className="h-3 w-3" /></a></span>
              </li>
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">2</span>
                <span>Click <strong>Generate new token</strong> → give it a name (e.g. "NimbusPanel")</span>
              </li>
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">3</span>
                <span>Under <strong>Repository access</strong> → select <strong>Only select repositories</strong> → pick your private repos</span>
              </li>
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">4</span>
                <span>Under <strong>Permissions</strong> → <strong>Contents</strong> → set to <strong>Read-only</strong></span>
              </li>
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">5</span>
                <span>Click <strong>Generate token</strong> → copy the token (starts with <code className="rounded bg-blue-100 px-1">github_pat_</code>)</span>
              </li>
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">6</span>
                <span>Paste it below — private repos will work automatically on next deploy</span>
              </li>
            </ol>
          </div>

          <form onSubmit={save} className="flex flex-wrap gap-3">
            <input
              className={`${inputCls} flex-1`}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="github_pat_11ABC... (paste your token here)"
              required
            />
            <button disabled={busy !== null} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
              {busy === 'save' ? 'Saving…' : 'Save Token'}
            </button>
          </form>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-slate-600">
            Token is saved and will be used automatically for private repos during deploy.
          </p>
          <div className="flex gap-2">
            <button
              onClick={checkToken}
              disabled={busy !== null}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === 'check' ? 'Checking…' : 'Test token'}
            </button>
            <button
              onClick={remove}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </button>
          </div>
          {/* Allow replacing token */}
          <form onSubmit={save} className="flex w-full flex-wrap gap-3 border-t border-slate-100 pt-3">
            <input
              className={`${inputCls} flex-1`}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Replace with new token (optional)"
            />
            <button disabled={busy !== null || !token.trim()} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
              {busy === 'save' ? 'Updating…' : 'Update'}
            </button>
          </form>
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><X className="mr-1 inline h-3.5 w-3.5" />{error}</p>}
      {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><Check className="mr-1 inline h-3.5 w-3.5" />{notice}</p>}
    </section>
  )
}

function NotificationsSection() {
  const [chat, setChat] = useState('')
  const [token, setToken] = useState('')
  const [tokenHint, setTokenHint] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ enabled: boolean; chat: string; tokenHint: string }>('/notifications')
      .then((n) => { setChat(n.chat); setTokenHint(n.tokenHint) })
      .catch(() => {})
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api('/notifications', { method: 'PUT', body: JSON.stringify({ token: token.trim(), chat: chat.trim() }) })
      setNotice('Notification settings saved')
      setToken('')
      const n = await api<{ chat: string; tokenHint: string }>('/notifications')
      setChat(n.chat)
      setTokenHint(n.tokenHint)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api('/notifications/test', { method: 'POST' })
      setNotice('Test message sent — check Telegram')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-xs text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Notifications (Telegram)</h2>
      <p className="text-xs text-slate-400">
        Get a Telegram message when a deploy or backup fails. Create a bot with
        <span className="font-mono"> @BotFather</span> (token) and get your chat id via
        <span className="font-mono"> @userinfobot</span>.
      </p>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Bot token {tokenHint && <span className="font-normal text-slate-400">(stored: {tokenHint})</span>}
          </label>
          <input className={inputCls} value={token} onChange={(e) => setToken(e.target.value)}
            placeholder="123456:ABC-DEF... (leave empty to keep)" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Chat id</label>
          <input className={inputCls} value={chat} onChange={(e) => setChat(e.target.value)} placeholder="123456789" />
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={sendTest} disabled={busy || !chat}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
            Send test
          </button>
          <p className="text-xs text-slate-400">Clear both fields and save to disable.</p>
        </div>
      </form>
    </section>
  )
}
