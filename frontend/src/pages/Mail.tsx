import { useEffect, useState } from 'react'
import { Globe, KeyRound, Mail as MailIcon, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { api } from '../api'

interface MailData {
  installed: boolean
  host: string
  domains: string[]
  mailboxes: { address: string; password: string }[]
  aliases: { address: string; target: string }[]
  phpSites: { id: number; domain: string }[]
  dkim: string[]
}

export default function Mail() {
  const [data, setData] = useState<MailData | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [newDomain, setNewDomain] = useState('')
  const [boxDomain, setBoxDomain] = useState('')
  const [boxLocal, setBoxLocal] = useState('')
  const [aliasDomain, setAliasDomain] = useState('')
  const [aliasLocal, setAliasLocal] = useState('')
  const [aliasTarget, setAliasTarget] = useState('')
  const [webmailSite, setWebmailSite] = useState('')
  const [webmailTarget, setWebmailTarget] = useState<'panel' | 'site'>('panel')
  const [dkimRecords, setDkimRecords] = useState<Record<string, string>>({})

  async function load() {
    try {
      const d = await api<MailData>('/mail')
      setData(d)
      if (d.domains.length && !boxDomain) setBoxDomain(d.domains[0])
      if (d.domains.length && !aliasDomain) setAliasDomain(d.domains[0])
      if (d.phpSites.length && !webmailSite) setWebmailSite(String(d.phpSites[0].id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function act(fn: () => Promise<unknown>, okMsg?: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = (await fn()) as { password?: string } | void
      if (res?.password) setNotice(`${okMsg ?? ''} — password: ${res.password} (save it now)`.trim())
      else if (okMsg) setNotice(okMsg)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <p className="text-slate-500">Loading…</p>

  const sel = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
  const btn = 'rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Mail</h1>
        <p className="mt-0.5 text-sm text-slate-500">Domains, mailboxes, aliases, DKIM &amp; webmail</p>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      {!data.installed ? (
        <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          The mail stack (Postfix + Dovecot) is not installed on this server yet — run the provisioning step on the server.
        </p>
      ) : (
        <>
          {/* domains */}
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Mail Domains</h2>
            <div className="flex flex-wrap gap-3">
              {data.domains.map((d) => (
                <span key={d} className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-sm">
                  <Globe className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-medium text-slate-700">{d}</span>
                  <button
                    className="text-slate-300 transition hover:text-red-500"
                    onClick={() => {
                      if (!confirm(`Remove mail domain ${d} and ALL its mailboxes/aliases?`)) return
                      const purge = confirm('Also destroy all stored mail data?')
                      act(() => api(`/mail/domain/${encodeURIComponent(d)}?purge=${purge ? 1 : 0}`, { method: 'DELETE' }), `${d} removed`)
                    }}
                  ><Trash2 className="h-3.5 w-3.5" /></button>
                </span>
              ))}
              {data.domains.length === 0 && <p className="text-sm text-slate-400">No mail domains yet.</p>}
            </div>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!newDomain) return
                act(() => api('/mail/domain', { method: 'POST', body: JSON.stringify({ domain: newDomain.trim().toLowerCase() }) }), `Domain ${newDomain} added`)
                  .then(() => setNewDomain(''))
              }}
            >
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Add a domain you own</label>
                <input className={`${sel} w-72`} value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="example.com" required />
              </div>
              <button disabled={busy} className={btn}>Add Domain</button>
            </form>
          </section>

          {/* mailboxes */}
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Mailboxes</h2>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-2.5">Address</th><th className="px-4 py-2.5 text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.mailboxes.map((b) => (
                    <tr key={b.address} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono font-medium text-slate-800">{b.address}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1.5">
                          <button className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                            onClick={() => act(() => api('/mail/box/passwd', {
                              method: 'POST',
                              body: JSON.stringify({ domain: b.address.split('@')[1], localpart: b.address.split('@')[0] }),
                            }), 'Password changed')}
                          ><KeyRound className="h-3.5 w-3.5" /> New password</button>
                          <button className="flex items-center gap-1 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                            onClick={() => { if (confirm(`Delete ${b.address} and its stored mail?`)) act(() => api(`/mail/box?domain=${b.address.split('@')[1]}&localpart=${b.address.split('@')[0]}`, { method: 'DELETE' }), 'Mailbox deleted') }}
                          ><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.mailboxes.length === 0 && <tr><td colSpan={2} className="px-4 py-6 text-center text-slate-400">No mailboxes yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!boxDomain || !boxLocal) return
                act(() => api('/mail/box', {
                  method: 'POST',
                  body: JSON.stringify({ domain: boxDomain, localpart: boxLocal.trim().toLowerCase() }),
                }), 'Mailbox created').then(() => setBoxLocal(''))
              }}
            >
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Local part</label>
                <input className={`${sel} w-36`} value={boxLocal} onChange={(e) => setBoxLocal(e.target.value)} placeholder="name" required />
              </div>
              <span className="pb-2.5 text-slate-400">@</span>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Domain</label>
                <select className={sel} value={boxDomain} onChange={(e) => setBoxDomain(e.target.value)}>
                  {data.domains.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <button disabled={busy || !data.domains.length} className={btn}>Create Mailbox</button>
            </form>
          </section>

          {/* aliases */}
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Aliases (forwarding)</h2>
            <ul className="space-y-1.5 text-sm">
              {data.aliases.map((a) => (
                <li key={a.address} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  <span className="font-mono font-medium text-slate-800">{a.address}</span>
                  <span className="text-slate-400">→</span>
                  <span className="font-mono text-slate-600">{a.target}</span>
                  <button className="ml-auto text-slate-300 transition hover:text-red-500"
                    onClick={() => act(() => api(`/mail/alias?domain=${a.address.split('@')[1]}&alias=${a.address.split('@')[0]}`, { method: 'DELETE' }), 'Alias removed')}
                  ><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
              {data.aliases.length === 0 && <p className="text-slate-400">No aliases yet.</p>}
            </ul>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                act(() => api('/mail/alias', {
                  method: 'POST',
                  body: JSON.stringify({ domain: aliasDomain, alias: aliasLocal.trim().toLowerCase(), target: aliasTarget.trim().toLowerCase() }),
                }), 'Alias created').then(() => { setAliasLocal(''); setAliasTarget('') })
              }}
            >
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Alias</label>
                <input className={`${sel} w-32`} value={aliasLocal} onChange={(e) => setAliasLocal(e.target.value)} placeholder="info" required />
              </div>
              <span className="pb-2.5 text-slate-400">@</span>
              <select className={sel} value={aliasDomain} onChange={(e) => setAliasDomain(e.target.value)}>
                {data.domains.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <span className="pb-2.5 text-slate-400">→</span>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Destination</label>
                <input className={`${sel} w-64`} value={aliasTarget} onChange={(e) => setAliasTarget(e.target.value)} placeholder="you@example.com" required />
              </div>
              <button disabled={busy || !data.domains.length} className={btn}>Add Alias</button>
            </form>
          </section>

          {/* webmail */}
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Webmail (SnappyMail)</h2>
            <p className="text-xs text-slate-400">
              Installs the lightweight SnappyMail webmail preset to this mail server.
              Users sign in with their full email address + mailbox password.
            </p>
            <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => {
              e.preventDefault()
              const body = webmailTarget === 'panel'
                ? { target: 'panel' }
                : { target: 'site', siteId: Number(webmailSite) }
              act(() => api('/mail/webmail', { method: 'POST', body: JSON.stringify(body) }), 'Webmail installed')
            }}>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="radio" checked={webmailTarget === 'panel'} onChange={() => setWebmailTarget('panel')} className="accent-emerald-600" />
                  On the panel domain (recommended)
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="radio" checked={webmailTarget === 'site'} onChange={() => setWebmailTarget('site')} className="accent-emerald-600" />
                  On a PHP site
                </label>
              </div>
              {webmailTarget === 'site' && (
                <select className={sel} value={webmailSite} onChange={(e) => setWebmailSite(e.target.value)}>
                  {data.phpSites.map((s) => <option key={s.id} value={s.id}>{s.domain}</option>)}
                </select>
              )}
              <button disabled={busy || (webmailTarget === 'site' && !data.phpSites.length)} className={btn}>Install Webmail</button>
            </form>
            {data.installed && (
              <a href="/webmail/" target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline">
                <MailIcon className="h-4 w-4" /> open {location.origin}/webmail ↗
              </a>
            )}
          </section>

          {/* DNS + DKIM */}
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">DNS &amp; DKIM</h2>
            <pre className="overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">{`# For every mail domain (replace example.com):
example.com.        MX    10 ${data.host}.
example.com.        TXT   "v=spf1 mx ~all"
_dmarc.example.com. TXT   "v=DMARC1; p=quarantine; rua=mailto:postmaster@example.com"

# Optional but recommended:
${data.host}.       A     <server IP>   # and set reverse DNS (PTR) at your VPS provider`}</pre>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">DKIM signing (per domain)</p>
              {data.domains.length === 0 && <p className="text-sm text-slate-400">Add a mail domain first.</p>}
              {data.domains.map((d) => {
                const active = data.dkim.includes(d)
                return (
                  <div key={d} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium text-slate-800">{d}</span>
                      <span className={`flex items-center gap-1.5 text-xs font-medium ${active ? 'text-emerald-700' : 'text-slate-400'}`}>
                        <span className={`h-2 w-2 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        {active ? 'signing active' : 'not generated'}
                      </span>
                      <span className="ml-auto flex gap-1.5 text-xs">
                        {!active ? (
                          <button
                            disabled={busy}
                            onClick={() => act(async () => {
                              const res = await api<{ record: string }>('/mail/dkim', {
                                method: 'POST',
                                body: JSON.stringify({ domain: d }),
                              })
                              setDkimRecords((m) => ({ ...m, [d]: res.record }))
                            }, `DKIM keys generated for ${d} — publish the TXT record below`)}
                            className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
                          ><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />Generate keys</button>
                        ) : (
                          <>
                            <button
                              disabled={busy}
                              onClick={async () => {
                                try {
                                  const res = await api<{ record: string }>(`/mail/dkim-record?domain=${encodeURIComponent(d)}`)
                                  setDkimRecords((m) => ({ ...m, [d]: res.record }))
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : 'Failed')
                                }
                              }}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                            >Show record</button>
                            <button
                              disabled={busy}
                              onClick={() => { if (confirm(`Delete DKIM keys for ${d}? Mail will be sent unsigned until regenerated.`)) act(() => api(`/mail/dkim?domain=${encodeURIComponent(d)}`, { method: 'DELETE' }), 'DKIM removed') }}
                              className="rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                            >Delete</button>
                          </>
                        )}
                      </span>
                    </div>
                    {dkimRecords[d] && (
                      <pre className="max-h-32 overflow-auto rounded-lg border border-slate-200 bg-white p-2.5 text-xs break-all text-emerald-800">{dkimRecords[d]}</pre>
                    )}
                  </div>
                )
              })}
              <p className="text-xs text-slate-400">
                Publish the shown TXT record at your DNS provider (selector <span className="font-mono">mail</span>).
                Together with SPF + DMARC above this makes your mail deliverable to Gmail/Outlook.
              </p>
            </div>

            <p className="text-xs text-slate-400">
              Clients: IMAP <span className="font-mono">{data.host}:143 (STARTTLS) / 993 (SSL)</span>,
              SMTP <span className="font-mono">:587</span>. Port 25 must be open at your VPS provider for incoming mail.
            </p>
          </section>
        </>
      )}
    </div>
  )
}
