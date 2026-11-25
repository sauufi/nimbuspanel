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
  // ---- Git Credentials (GitHub token for private repos) ----

  app.get('/api/git-token', { preHandler: [requireAuth] }, async () => {
    const res = await sudo(['panel-git-token', 'get'])
    if (res.code !== 0) return { configured: false, hint: '' }
    const lines = res.stdout.trim().split('\n')
    const hint = lines.find((l) => l.startsWith('hint: '))?.slice(6) ?? ''
    const configured = lines.some((l) => l.includes('configured: yes'))
    return { configured, hint }
  })

  app.put('/api/git-token', { preHandler: [requireAuth] }, async (req, reply) => {
    const Body = z
      .object({
        token: z.string().regex(/^(ghp_|github_pat_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_]+$/, 'Invalid GitHub token format (must start with ghp_ or github_pat_)'),
      })
      .safeParse(req.body)
    if (!Body.success) {
      return reply.code(400).send({ error: Body.error.issues[0]?.message ?? 'invalid token' })
    }

    const res = await sudo(['panel-git-token', 'set', Body.data.token])
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })

    // Validate token against GitHub API
    const check = await sudo(['panel-git-token', 'check'])
    if (check.code !== 0) {
      // Token saved but invalid — warn but keep it (might be network issue)
      audit('git-token.saved-invalid', { hint: Body.data.token.slice(0, 7) + '...' })
      return {
        ok: true,
        warning: 'Token saved but could not verify with GitHub API. It will be used on next deploy.',
      }
    }

    audit('git-token.saved', { hint: Body.data.token.slice(0, 7) + '...' })
    return { ok: true, message: 'GitHub token saved and verified' }
  })

  app.delete('/api/git-token', { preHandler: [requireAuth] }, async (_req, reply) => {
    const res = await sudo(['panel-git-token', 'remove'])
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    audit('git-token.removed', {})
    return { ok: true }
  })

  app.post('/api/git-token/check', { preHandler: [requireAuth] }, async (_req, reply) => {
    const res = await sudo(['panel-git-token', 'check'])
    if (res.code !== 0) return reply.code(400).send({ error: helperError(res) })
    return { ok: true, message: 'Token is valid' }
  })

  // ---- Panel hostname settings ----
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
