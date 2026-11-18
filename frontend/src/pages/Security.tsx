import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { KeyRound, ShieldCheck, ShieldOff } from 'lucide-react'
import { api } from '../api'

interface Status {
  enabled: boolean
  pending: boolean
}

export default function Security() {
  const [status, setStatus] = useState<Status | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [otpauth, setOtpauth] = useState<string | null>(null)
  const [qrData, setQrData] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadStatus() {
    try {
      setStatus(await api<Status>('/auth/totp'))
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    loadStatus()
  }, [])

  async function startSetup() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await api<{ secret: string; otpauth: string }>('/auth/totp/setup', { method: 'POST' })
      setSecret(res.secret)
      setOtpauth(res.otpauth)
      setQrData(await QRCode.toDataURL(res.otpauth, { margin: 1, width: 220 }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setBusy(false)
    }
  }

  async function enable(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api('/auth/totp/enable', { method: 'POST', body: JSON.stringify({ code }) })
      setNotice('Two-factor authentication is now active')
      setSecret(null)
      setQrData(null)
      setCode('')
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable')
    } finally {
      setBusy(false)
    }
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api('/auth/totp/disable', { method: 'POST', body: JSON.stringify({ password }) })
      setNotice('Two-factor authentication disabled')
      setPassword('')
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Security</h1>
        <p className="mt-0.5 text-sm text-slate-500">Panel password and two-factor authentication</p>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      <PasswordSection onDone={(m) => { setNotice(m); setError('') }} onError={(m) => { setError(m); setNotice('') }} />

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Two-Factor Authentication (TOTP)</h2>
          {status && (
            <span className={`flex items-center gap-1.5 text-xs font-medium ${status.enabled ? 'text-emerald-700' : 'text-slate-400'}`}>
              <span className={`h-2 w-2 rounded-full ${status.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              {status.enabled ? 'enabled' : 'disabled'}
            </span>
          )}
        </div>

        {status?.enabled ? (
          <form onSubmit={disable} className="max-w-sm space-y-3">
            <p className="text-sm text-slate-500">
              Sign-in requires a 6-digit code from your authenticator app.
            </p>
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              type="password"
              placeholder="Panel password to confirm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              disabled={busy}
              className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
            >
              <ShieldOff className="h-4 w-4" />
              {busy ? 'Working…' : 'Disable 2FA'}
            </button>
          </form>
        ) : secret ? (
          <form onSubmit={enable} className="space-y-4">
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
              {qrData && (
                <img src={qrData} alt="TOTP QR code" className="rounded-xl border border-slate-200 bg-white p-2" />
              )}
              <div className="space-y-2 text-sm">
                <p className="text-slate-700">1. Scan the QR with Google Authenticator / Aegis / 1Password…</p>
                <p className="text-slate-700">2. Enter the 6-digit code to activate:</p>
                <p className="break-all rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-xs text-slate-500">
                  manual key: {secret}
                </p>
              </div>
            </div>
            <input
              className="w-full max-w-xs rounded-lg border border-emerald-300 bg-white px-3 py-2.5 font-mono text-sm tracking-[0.35em] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              placeholder="123456"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
            />
            <div className="flex gap-2">
              <button disabled={busy || code.length !== 6}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
                <ShieldCheck className="h-4 w-4" />
                {busy ? 'Verifying…' : 'Activate 2FA'}
              </button>
              <button type="button" onClick={() => { setSecret(null); setQrData(null) }}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="max-w-lg space-y-3">
            <p className="text-sm text-slate-500">
              Add a second factor to sign-in: a 6-digit time-based code from an authenticator app,
              generated per-account on your phone.
            </p>
            <button
              onClick={startSetup}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4" />
              {busy ? 'Generating…' : 'Enable 2FA'}
            </button>
          </div>
        )}
      </section>

      {otpauth && (
        <p className="break-all text-xs text-slate-300">{otpauth}</p>
      )}
    </div>
  )
}

function PasswordSection({ onDone, onError }: { onDone: (msg: string) => void; onError: (msg: string) => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (next !== repeat) return onError('New passwords do not match')
    if (next.length < 10) return onError('New password must be at least 10 characters')
    setBusy(true)
    try {
      await api('/auth/password', { method: 'POST', body: JSON.stringify({ current, next }) })
      setCurrent(''); setNext(''); setRepeat('')
      onDone('Panel password changed')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Panel Password</h2>
      <form onSubmit={submit} className="grid max-w-md gap-3">
        <input type="password" placeholder="Current password" value={current}
          onChange={(e) => setCurrent(e.target.value)} required className={inputCls} />
        <input type="password" placeholder="New password (min. 10 characters)" value={next}
          onChange={(e) => setNext(e.target.value)} required className={inputCls} />
        <input type="password" placeholder="Repeat new password" value={repeat}
          onChange={(e) => setRepeat(e.target.value)} required className={inputCls} />
        <button disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
          {busy ? 'Changing…' : 'Change Password'}
        </button>
      </form>
    </section>
  )
}
