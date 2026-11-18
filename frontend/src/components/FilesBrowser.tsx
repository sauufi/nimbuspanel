import { useEffect, useState } from 'react'
import { Download, FolderUp, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { api } from '../api'

interface Entry {
  type: string
  size: number
  mtime: string
  name: string
}

function fmtSize(n: number): string {
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  if (n > 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

const EDITABLE_RE = /\.(txt|md|php|html?|css|js|ts|json|xml|yml|yaml|ini|conf|env|sql|htaccess|py|sh|toml|log)$/i

export default function FilesBrowser({ siteKey }: { siteKey: number }) {
  const [path, setPath] = useState('')
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [editor, setEditor] = useState<{ path: string; content: string; isNew: boolean } | null>(null)
  const [renaming, setRenaming] = useState<Entry | null>(null)
  const [renameTo, setRenameTo] = useState('')

  async function load(p: string) {
    try {
      const res = await api<{ entries: Entry[] }>(`/sites/${siteKey}/fs?path=${encodeURIComponent(p)}`)
      setEntries(res.entries)
      setPath(p)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list')
    }
  }

  useEffect(() => {
    load('')
  }, [siteKey])

  async function act(fn: () => Promise<unknown>, okMsg?: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await fn()
      if (okMsg) setNotice(okMsg)
      await load(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function openFile(rel: string) {
    setBusy(true)
    setError('')
    try {
      const res = await api<{ content: string }>(`/sites/${siteKey}/fs/read?path=${encodeURIComponent(rel)}`)
      setEditor({ path: rel, content: res.content, isNew: false })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open')
    } finally {
      setBusy(false)
    }
  }

  async function saveEditor() {
    if (!editor) return
    setBusy(true)
    setError('')
    try {
      await api(`/sites/${siteKey}/fs/write`, {
        method: 'PUT',
        body: JSON.stringify({ path: editor.path, content: editor.content }),
      })
      setNotice(`Saved ${editor.path}`)
      setEditor(null)
      await load(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  async function uploadFile(file: File) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const buf = await file.arrayBuffer()
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
      const rel = `${path ? `${path}/` : ''}${file.name}`
      await api(`/sites/${siteKey}/fs/upload`, {
        method: 'POST',
        body: JSON.stringify({ path: rel, contentBase64: b64 }),
      })
      setNotice(`Uploaded ${file.name}`)
      await load(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const crumbs = path ? path.split('/') : []
  const jump = (idx: number): string => (idx < 0 ? '' : crumbs.slice(0, idx + 1).join('/'))

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Files</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            onClick={() => setEditor({ path: `${path ? `${path}/` : ''}new-file.txt`, content: '', isNew: true })}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          ><Plus className="h-3.5 w-3.5" /> New file</button>
          <button
            onClick={() => {
              const name = prompt('New folder name (a-z 0-9 . _ -):')
              if (!name) return
              act(() => api(`/sites/${siteKey}/fs/mkdir`, { method: 'POST', body: JSON.stringify({ path: `${path ? `${path}/` : ''}${name}` }) }), `Folder ${name} created`)
            }}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          ><FolderUp className="h-3.5 w-3.5" /> New folder</button>
          <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 font-medium text-emerald-800 transition hover:bg-emerald-100">
            <Upload className="h-3.5 w-3.5" /> Upload
            <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f) }} />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <button className="font-medium text-slate-700 hover:underline" onClick={() => load('')}>site root</button>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-slate-300">/</span>
            <button className="hover:text-slate-700 hover:underline" onClick={() => load(jump(i))}>{c}</button>
          </span>
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2.5">Name</th>
              <th className="px-3 py-2.5">Size</th>
              <th className="px-3 py-2.5">Modified</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {path && (
              <tr className="hover:bg-slate-50">
                <td className="px-3 py-2" colSpan={4}>
                  <button className="text-slate-500 hover:text-slate-800" onClick={() => load(jump(crumbs.length - 2))}>← ..</button>
                </td>
              </tr>
            )}
            {(entries ?? []).map((e) => {
              const rel = `${path ? `${path}/` : ''}${e.name}`
              const isDir = e.type === 'd'
              return (
                <tr key={e.name} className="transition hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <button
                      className={`${isDir ? 'text-indigo-700' : EDITABLE_RE.test(e.name) ? 'text-emerald-700' : 'text-slate-700'} hover:underline`}
                      onClick={() => (isDir ? load(rel) : openFile(rel))}
                    >
                      {isDir ? '📁' : '📄'} {e.name}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">{isDir ? '—' : fmtSize(e.size)}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{e.mtime}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="flex justify-end gap-1">
                      {!isDir && (
                        <a href={`/api/sites/${siteKey}/fs/download?path=${encodeURIComponent(rel)}`}
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700" title="Download">
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => { setRenaming(e); setRenameTo(e.name) }}
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700" title="Rename">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (!confirm(`Delete ${isDir ? 'folder (recursive!) ' : ''}${e.name}?`)) return
                          act(() => api(`/sites/${siteKey}/fs?path=${encodeURIComponent(rel)}`, { method: 'DELETE' }), `${e.name} deleted`)
                        }}
                        className="rounded-lg border border-red-100 p-1.5 text-red-500 transition hover:bg-red-50" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        Paths are restricted to this site's root; operations run as the site user. Filenames with spaces/unicode are not supported yet.
      </p>

      {renaming && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setRenaming(null)}>
          <div className="w-full max-w-sm space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-slate-900">Rename {renaming.name}</p>
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-emerald-500"
              value={renameTo}
              onChange={(e) => setRenameTo(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const from = `${path ? `${path}/` : ''}${renaming.name}`
                  const to = `${path ? `${path}/` : ''}${renameTo}`
                  setRenaming(null)
                  act(() => api(`/sites/${siteKey}/fs/rename`, { method: 'POST', body: JSON.stringify({ from, to }) }), 'Renamed')
                }}
                disabled={busy || !renameTo || renameTo === renaming.name}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >Rename</button>
              <button onClick={() => setRenaming(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {editor && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setEditor(null)}>
          <div className="flex h-full max-h-[85vh] w-full max-w-4xl flex-col space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <p className="truncate font-mono text-sm font-medium text-emerald-700">{editor.path}</p>
              <div className="flex gap-2">
                <button onClick={saveEditor} disabled={busy}
                  className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                  {busy ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditor(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Close</button>
              </div>
            </div>
            <textarea
              className="min-h-0 flex-1 rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200 outline-none"
              value={editor.content}
              onChange={(e) => setEditor({ ...editor, content: e.target.value })}
              spellCheck={false}
            />
          </div>
        </div>
      )}
    </section>
  )
}
