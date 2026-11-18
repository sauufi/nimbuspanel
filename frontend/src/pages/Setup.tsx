import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { api } from '../api'

export default function Setup() {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) return setError('Passwords do not match')
    if (password.length < 10) return setError('Password must be at least 10 characters')
    setBusy(true)
    setError('')
    try {
      await api('/auth/setup', { method: 'POST', body: JSON.stringify({ username, password }) })
      location.href = '/'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create admin')
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500 text-base font-bold text-slate-900">NP</span>
          <div className="text-center">
            <h1 className="text-lg font-semibold text-slate-900">Initial Setup</h1>
            <p className="text-sm text-slate-500">Create the admin account for NimbusPanel.</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Admin username</label>
            <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Password (min. 10 characters)</label>
            <input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Repeat password</label>
            <input type="password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          <button
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            <UserPlus className="h-4 w-4" />
            {busy ? 'Creating…' : 'Create Admin'}
          </button>
        </form>
      </div>
    </div>
  )
}
