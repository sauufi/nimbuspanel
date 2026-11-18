import { useEffect, useState } from 'react'
import { Database as DbIcon, Download, KeyRound, Plus, Trash2, Upload } from 'lucide-react'
import { api } from '../api'

interface DbItem {
  id: number
  site_id: number | null
  name: string
  db_user: string
  db_pass: string
  created_at: string
  sizeMb: number
  tables: number
  exists: boolean
}

interface SiteLite {
  id: number
  domain: string
}

export default function Database() {
  const [dbs, setDbs] = useState<DbItem[] | null>(null)
  const [sites, setSites] = useState<SiteLite[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [newCred, setNewCred] = useState<{ name: string; dbUser: string; dbPass: string } | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [siteId, setSiteId] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [importFor, setImportFor] = useState<DbItem | null>(null)

  async function load() {
    try {
      const [d, s] = await Promise.all([
        api<{ databases: DbItem[] }>('/db'),
        api<{ sites: SiteLite[] }>('/sites'),
      ])
      setDbs(d.databases)
      setSites(s.sites)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function createDb(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await api<{ database: { name: string; dbUser: string; dbPass: string } }>('/db', {
        method: 'POST',
        body: JSON.stringify({ siteId: siteId ? Number(siteId) : null, name: name.trim().toLowerCase() }),
      })
      setNewCred(res.database)
      setShowForm(false)
      setName('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create database')
    } finally {
      setBusy(false)
    }
  }

  async function rotate(dbItem: DbItem) {
    if (!confirm(`Change the password for database ${dbItem.name}? Applications using it must be updated too.`)) return
    setBusy(true)
    try {
      const res = await api<{ dbPass: string }>(`/db/${dbItem.id}/password`, { method: 'POST' })
      setNewCred({ name: dbItem.name, dbUser: dbItem.db_user, dbPass: res.dbPass })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setBusy(false)
    }
  }

  async function drop(dbItem: DbItem) {
    const typed = prompt(`PERMANENTLY DELETE database ${dbItem.name} and all its tables.\nType the database name to confirm:`)
    if (typed !== dbItem.name) return
    setBusy(true)
    try {
      await api(`/db/${dbItem.id}`, { method: 'DELETE' })
      setNotice(`Database ${dbItem.name} deleted`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setBusy(false)
    }
  }

  async function doImport(file: File) {
    if (!importFor) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const sql = await file.text()
      await api(`/db/${importFor.id}/import`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: sql })
      setNotice(`Import into ${importFor.name} finished`)
      setImportFor(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
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
          <h1 className="text-xl font-semibold text-slate-900">Databases</h1>
          <p className="mt-0.5 text-sm text-slate-500">MariaDB databases and users</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          <Plus className="h-4 w-4" />
          {showForm ? 'Cancel' : 'New Database'}
        </button>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      {newCred && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="mb-2 text-sm font-semibold text-emerald-800">Credentials for {newCred.name} — save them now (shown only once):</p>
          <pre className="overflow-auto rounded-lg border border-emerald-200 bg-white p-3 font-mono text-xs text-slate-700">{`Database: ${newCred.name}\nUser:     ${newCred.dbUser}\nPassword: ${newCred.dbPass}\nHost:     localhost`}</pre>
          <button className="mt-2 text-xs text-emerald-700 hover:underline" onClick={() => setNewCred(null)}>close</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={createDb} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Database name (a-z, 0-9, _)</label>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. wp_shop" required />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Linked site <span className="font-normal text-slate-400">(optional, just a label)</span></label>
              <select className={inputCls} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">— no site —</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.domain}</option>)}
              </select>
            </div>
          </div>
          <button disabled={busy} className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
            {busy ? 'Creating…' : 'Create Database'}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Database</th>
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Size</th>
              <th className="px-5 py-3">Tables</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(dbs ?? []).map((d) => (
              <tr key={d.id} className="transition hover:bg-slate-50">
                <td className="px-5 py-3.5">
                  <span className="flex items-center gap-2 font-mono font-medium text-slate-800">
                    <DbIcon className="h-4 w-4 text-slate-300" /> {d.name}
                  </span>
                </td>
                <td className="px-5 py-3.5 font-mono text-slate-500">{d.db_user}</td>
                <td className="px-5 py-3.5 text-slate-600">{d.sizeMb} MB</td>
                <td className="px-5 py-3.5 text-slate-600">{d.tables}</td>
                <td className="px-5 py-3.5">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <a href={`/api/db/${d.id}/dump`}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100">
                      <Download className="h-3.5 w-3.5" /> Dump .sql
                    </a>
                    <button
                      onClick={() => document.getElementById(`imp-${d.id}`)?.click()}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                    ><Upload className="h-3.5 w-3.5" /> Import</button>
                    <input id={`imp-${d.id}`} type="file" accept=".sql,.txt" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) { setImportFor(d); doImport(f) } }} />
                    <button onClick={() => rotate(d)}
                      className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100">
                      <KeyRound className="h-3.5 w-3.5" /> Password
                    </button>
                    <button onClick={() => drop(d)}
                      className="flex items-center gap-1 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100">
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {dbs !== null && dbs.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                <DbIcon className="mx-auto mb-2 h-8 w-8 text-slate-200" /> No databases yet.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {importFor && busy && <p className="text-sm text-slate-500">Importing into {importFor.name}…</p>}
    </div>
  )
}
