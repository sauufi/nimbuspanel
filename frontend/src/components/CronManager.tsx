import { useEffect, useState } from 'react'
import { Clock, Plus, Power, Trash2 } from 'lucide-react'
import { api } from '../api'

interface CronJob {
  id: string
  schedule: string
  command: string
  enabled: boolean
}

const PRESETS = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at 02:00', value: '0 2 * * *' },
  { label: 'Every day at 06:00', value: '0 6 * * *' },
  { label: 'Every Monday 08:00', value: '0 8 * * 1' },
  { label: 'Every month (1st) 00:00', value: '0 0 1 * *' },
]

export default function CronManager({ siteKey, domain }: { siteKey: number; domain: string }) {
  const [jobs, setJobs] = useState<CronJob[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [schedule, setSchedule] = useState('*/5 * * * *')
  const [command, setCommand] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const res = await api<{ jobs: CronJob[] }>(`/sites/${siteKey}/cron`)
      setJobs(res.jobs)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    }
  }

  useEffect(() => {
    load()
  }, [siteKey])

  async function addJob(e: React.FormEvent) {
    e.preventDefault()
    if (!schedule.trim() || !command.trim()) return setError('Schedule and command are required')
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api(`/sites/${siteKey}/cron`, {
        method: 'POST',
        body: JSON.stringify({ schedule: schedule.trim(), command: command.trim() }),
      })
      setNotice('Cron job added')
      setCommand('')
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add')
    } finally {
      setBusy(false)
    }
  }

  async function del(jobId: string) {
    if (!confirm('Delete this cron job?')) return
    setBusy(true)
    try {
      await api(`/sites/${siteKey}/cron?jobId=${jobId}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(jobId: string) {
    setBusy(true)
    try {
      await api(`/sites/${siteKey}/cron/toggle`, { method: 'POST', body: JSON.stringify({ jobId }) })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle')
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Cron Jobs</h2>
          <p className="text-xs text-slate-400">Scheduled tasks for {domain} — runs as the site user</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {showForm ? 'Cancel' : 'Add Job'}
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

      {showForm && (
        <form onSubmit={addJob} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Schedule</label>
              <select className={inputCls} value={schedule} onChange={(e) => setSchedule(e.target.value)}>
                {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label} ({p.value})</option>)}
                <option value="custom">Custom…</option>
              </select>
              {schedule === 'custom' && (
                <input
                  className={`${inputCls} mt-1.5 font-mono`}
                  placeholder="* * * * * (min hour day month weekday)"
                  value=""
                  onChange={(e) => setSchedule(e.target.value)}
                />
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Command</label>
              <input
                className={`${inputCls} font-mono`}
                placeholder="php /var/www/domain/cron.php"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                required
              />
            </div>
          </div>
          <button disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
            {busy ? 'Adding…' : 'Add Cron Job'}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-2.5">Schedule</th>
              <th className="px-4 py-2.5">Command</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(jobs ?? []).map((job) => (
              <tr key={job.id} className="transition hover:bg-slate-50">
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1.5 font-mono text-xs text-slate-700">
                    <Clock className="h-3.5 w-3.5 text-slate-300" />
                    {job.schedule}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 break-all">{job.command}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    job.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {job.enabled ? '● active' : '○ paused'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="flex justify-end gap-1">
                    <button
                      onClick={() => toggle(job.id)}
                      disabled={busy}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-100"
                      title={job.enabled ? 'Pause' : 'Resume'}
                    >
                      <Power className={`h-3.5 w-3.5 ${job.enabled ? 'text-emerald-500' : 'text-slate-300'}`} />
                    </button>
                    <button
                      onClick={() => del(job.id)}
                      disabled={busy}
                      className="rounded-lg border border-red-100 p-1.5 text-red-400 transition hover:bg-red-50"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </td>
              </tr>
            ))}
            {jobs !== null && jobs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  <Clock className="mx-auto mb-2 h-8 w-8 text-slate-200" />
                  No cron jobs yet — click "Add Job" to schedule a task.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        Jobs run as the site user ({domain}). Commands execute from the site's home directory.
        Common presets are available; custom cron expressions supported (min hour day month weekday).
      </p>
    </section>
  )
}
