import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { audit, db } from './db'
import { sudo, tail } from './exec'
import { requireAuth } from './auth'

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/

interface HostStatus {
  mode: 'none' | 'ip' | 'domain'
  hostname: string
  ssl: 'no' | 'pending' | 'yes'
  webmail: boolean
}

function parseStatus(stdout: string): HostStatus {
  const map = new Map<string, string>()
  for (const line of stdout.trim().split('\n')) {
    const [k, v] = line.split('=')
    if (k && v !== undefined) map.set(k, v)
  }
  const mode = map.get('mode') as HostStatus['mode']
  return {
    mode: mode === 'domain' || mode === 'ip' ? mode : 'none',
    hostname: map.get('hostname') ?? '-',
    ssl: (map.get('ssl') as HostStatus['ssl']) ?? 'no',
    webmail: map.get('webmail') === 'yes',
  }
}

function helperError(res: { code: number; stdout: string; stderr: string }): string {
  return tail(res.stderr || res.stdout) || `helper exited with code ${res.code}`
}

export async function hostRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/panel-host', { preHandler: [requireAuth] }, async () => {
    const res = await sudo(['panel-hostname', 'status'])
    return parseStatus(res.stdout)
  })

  // Set the panel hostname. Empty string = back to IP-only default mode.
  app.post('/api/panel-host', { preHandler: [requireAuth] }, async (req, reply) => {
    const Body = z.object({ hostname: z.string().trim().toLowerCase().max(253) }).safeParse(req.body)
    if (!Body.success) return reply.code(400).send({ error: 'Invalid input' })
    const hostname = Body.data.hostname

    if (hostname) {
      if (!DOMAIN_RE.test(hostname)) return reply.code(400).send({ error: 'Invalid domain format' })
      const clash = db.prepare('SELECT 1 FROM sites WHERE domain = ?').get(hostname)
      if (clash) return reply.code(400).send({ error: `${hostname} is already used by a site on this server` })
    }

    // set-domain runs acme issuance — allow up to 3 minutes
    const res = hostname
      ? await sudo(['panel-hostname', 'set-domain', hostname], { timeoutMs: 180_000 })
      : await sudo(['panel-hostname', 'set-ip'], { timeoutMs: 60_000 })

    if (res.code === 3) {
      // saved, but SSL pending (DNS not ready yet)
      audit('panel-host.set', { hostname, ssl: 'pending' })
      return {
        ok: true,
        sslPending: true,
        message: tail(res.stderr || res.stdout) || 'Hostname saved (HTTP only) — point DNS here, then retry SSL',
      }
    }
    if (res.code !== 0) {
      audit('panel-host.set.failed', { hostname, error: helperError(res) })
      return reply.code(500).send({ error: helperError(res) })
    }
    audit('panel-host.set', { hostname })
    const st = await sudo(['panel-hostname', 'status'])
    return { ok: true, message: tail(res.stdout), status: parseStatus(st.stdout) }
  })

  app.post('/api/panel-host/ssl', { preHandler: [requireAuth] }, async (_req, reply) => {
    const cur = parseStatus((await sudo(['panel-hostname', 'status'])).stdout)
    if (cur.mode !== 'domain' || cur.hostname === '-') {
      return reply.code(400).send({ error: 'Set a hostname first' })
    }
    const res = await sudo(['panel-hostname', 'issue-ssl', cur.hostname], { timeoutMs: 180_000 })
    if (res.code !== 0) {
      audit('panel-host.ssl.failed', { hostname: cur.hostname, error: helperError(res) })
      return reply.code(500).send({ error: helperError(res) })
    }
    audit('panel-host.ssl', { hostname: cur.hostname })
    return { ok: true, message: tail(res.stdout) }
  })
}
