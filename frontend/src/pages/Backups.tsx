import { useEffect, useState } from 'react'
import { Download, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { api } from '../api'

interface BackupFile {
  dir: string
  file: string
  size: number
}

interface Settings {
  enabled: boolean
  time: string
  retention: number
  scope: 'all' | 'sites' | 'db'
}

const scopeLabels: Record<string, string> = {
  all: 'Everything (sites + databases)',
  sites: 'Sites only',
  db: 'Databases only',
}

function fmtBytes(n: number): string {
  if (n > 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  if (n > 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

function kindOf(file: string): string {
  if (file.startsWith('db-')) return 'database'
  if (file.startsWith('site-')) return 'site'
  if (file.startsWith('panel.db')) return 'panel metadata'
  return 'other'
}

function stampLabel(dir: string): string {
  const y = dir.slice(0, 4), m = dir.slice(4, 6), d = dir.slice(6, 8), t = dir.slice(9)
  return `${y}-${m}-${d} ${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`
}

export default function Backups() {
  const [backups, setBackups] = useState<BackupFile[] | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [draft, setDraft] = useState<Settings | null>(null)
  const [runScope, setRunScope] = useState<'all' | 'sites' | 'db'>('all')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const [b, s] = await Promise.all([
        api<{ backups: BackupFile[] }>('/backups'),
        api<Settings>('/backups/settings'),
      ])
      setBackups(b.backups)
      setSettings(s)
      setDraft(s)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    if (!draft) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await api<{ output: string; settings: Settings }>('/backups/settings', {
        method: 'PUT',
        body: JSON.stringify(draft),
      })
      setSettings(res.settings)
      setNotice(res.output)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setBusy(false)
    }
  }

  async function runNow() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await api<{ output: string }>('/backups/run', {
        method: 'POST',
        body: JSON.stringify({ scope: runScope }),
      })
      setNotice(res.output)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed')
    } finally {
      setBusy(false)
    }
  }

  async function del(b: BackupFile) {
    if (!confirm(`Delete backup file ${b.file}?`)) return
    setBusy(true)
    try {
      await api(`/backups/file?dir=${b.dir}&file=${encodeURIComponent(b.file)}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setBusy(false)
    }
  }

  async function restore(b: BackupFile) {
    const label = b.file.startsWith('db-') ? `database ${b.file.slice(3, -7)}` : `site ${b.file.slice(5, -7)}`
    if (!confirm(`Restore ${label} from backup?\nCurrent data will be OVERWRITTEN.`)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await api<{ output: string }>('/backups/restore', {
        method: 'POST',
        body: JSON.stringify({ dir: b.dir, file: b.file }),
      })
      setNotice(res.output)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed')
    } finally {
      setBusy(false)
    }
  }

  const byDir = new Map<string, BackupFile[]>()
  for (const b of backups ?? []) {
    const arr = byDir.get(b.dir) ?? []
    arr.push(b)
    byDir.set(b.dir, arr)
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-40'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Backups</h1>
        <p className="mt-0.5 text-sm text-slate-500">Scheduled sets, restore points, and offsite sync</p>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      {draft && (
        <form onSubmit={saveSettings} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Automatic Backups</h2>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                className="h-4 w-4 accent-emerald-600"
              />
              {draft.enabled ? (
                <span className="font-medium text-emerald-700">enabled — daily at {draft.time}</span>
              ) : (
                <span className="text-slate-400">disabled</span>
              )}
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Run daily at</label>
              <input type="time" className={inputCls} value={draft.time}
                onChange={(e) => setDraft({ ...draft, time: e.target.value })} disabled={!draft.enabled} required />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Retention (sets kept)</label>
              <input type="number" min={1} max={90} className={inputCls} value={draft.retention}
                onChange={(e) => setDraft({ ...draft, retention: Number(e.target.value) })} required />
              <p className="mt-1.5 text-xs text-slate-400">Older sets are destroyed automatically.</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">What to include</label>
              <select className={inputCls} value={draft.scope}
                onChange={(e) => setDraft({ ...draft, scope: e.target.value as Settings['scope'] })}>
                <option value="all">{scopeLabels.all}</option>
                <option value="sites">{scopeLabels.sites}</option>
                <option value="db">{scopeLabels.db}</option>
              </select>
              <p className="mt-1.5 text-xs text-slate-400">Applied to scheduled backups.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button disabled={busy}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
              {busy ? 'Saving…' : 'Save Settings'}
            </button>
            {settings && (
              <p className="text-xs text-slate-400">
                Current: {settings.enabled ? `daily at ${settings.time}` : 'disabled'}, keep {settings.retention} sets, {scopeLabels[settings.scope].toLowerCase()}
              </p>
            )}
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Back up now — scope</label>
          <select
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500"
            value={runScope}
            onChange={(e) => setRunScope(e.target.value as typeof runScope)}
          >
            <option value="all">Everything</option>
            <option value="sites">Sites only</option>
            <option value="db">Databases only</option>
          </select>
        </div>
        <button
          onClick={runNow}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
          {busy ? 'Working…' : 'Back Up Now'}
        </button>
        <p className="text-xs text-slate-400">Manual backups also count toward retention.</p>
      </div>

      {backups !== null && backups.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
          No backups yet — click “Back Up Now” to create the first one.
        </p>
      )}

      {[...byDir.entries()].map(([dir, files]) => (
        <section key={dir} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-800">
            {stampLabel(dir)}
            <span className="ml-2 font-normal text-slate-400">{files.length} files</span>
          </h2>
          <ul className="divide-y divide-slate-100">
            {files.map((b) => (
              <li key={`${b.dir}/${b.file}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  b.file.startsWith('db-') ? 'bg-sky-50 text-sky-700'
                  : b.file.startsWith('site-') ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'}`}>
                  {kindOf(b.file)}
                </span>
                <span className="font-mono text-xs text-slate-700">{b.file}</span>
                <span className="text-xs text-slate-400">{fmtBytes(b.size)}</span>
                <span className="ml-auto flex gap-1.5 text-xs">
                  <a href={`/api/backups/download?dir=${b.dir}&file=${encodeURIComponent(b.file)}`}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-600 transition hover:bg-slate-100">
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                  {(b.file.startsWith('db-') || b.file.startsWith('site-')) && (
                    <button onClick={() => restore(b)} disabled={busy}
                      className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-50">
                      <RotateCcw className="h-3.5 w-3.5" /> Restore
                    </button>
                  )}
                  <button onClick={() => del(b)} disabled={busy}
                    className="flex items-center gap-1 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
