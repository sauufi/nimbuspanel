import os from 'node:os'
import crypto from 'node:crypto'
import fs from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { audit, db } from './db'
import { sudo, tail } from './exec'
import { requireAuth } from './auth'

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/
const LOCAL_RE = /^[a-z0-9][a-z0-9._-]{0,29}$/
const ADDR_RE = /^[a-z0-9][a-z0-9._-]*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/
const PASS_RE = /^[A-Za-z0-9._@+-]{8,64}$/

function helperError(res: { code: number; stdout: string; stderr: string }): string {
  return tail(res.stderr || res.stdout) || `helper exited with code ${res.code}`
}

function mailHost(): string {
  return os.hostname()
}

function mailInstalled(): boolean {
  return fs.existsSync('/etc/panel-mail')
}

function genPassword(): string {
  return crypto.randomBytes(12).toString('base64url').replace(/[^A-Za-z0-9._@+-]/g, 'x').slice(0, 16)
}

export async function mailRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/mail', { preHandler: [requireAuth] }, async () => {
    const domains = db.prepare('SELECT domain FROM mail_domains ORDER BY domain').all() as { domain: string }[]
    const boxes = db.prepare('SELECT address, password FROM mail_boxes ORDER BY address').all() as {
      address: string
      password: string
    }[]
    const aliases = db.prepare('SELECT address, target FROM mail_aliases ORDER BY address').all() as {
      address: string
      target: string
    }[]
    const phpSites = db
      .prepare("SELECT id, domain FROM sites WHERE type = 'php' ORDER BY domain")
      .all() as { id: number; domain: string }[]
    // dkim state lives on the filesystem — read via the helper
    const dkimRes = await sudo(['panel-mail', 'list'])
    const dkim = dkimRes.code === 0
      ? dkimRes.stdout.trim().split('\n').filter((l) => l.startsWith('dkim ')).map((l) => l.slice(5))
      : []
    return {
      installed: mailInstalled(),
      host: mailHost(),
      domains: domains.map((d) => d.domain),
      mailboxes: boxes,
      aliases,
      phpSites,
      dkim,
    }
  })

  app.post('/api/mail/dkim', { preHandler: [requireAuth] }, async (req, reply) => {
    const Body = z.object({ domain: z.string().regex(DOMAIN_RE) }).safeParse(req.body)
    if (!Body.success) return reply.code(400).send({ error: 'Invalid domain' })
    if (!db.prepare('SELECT 1 FROM mail_domains WHERE domain = ?').get(Body.data.domain)) {
      return reply.code(400).send({ error: 'Add the mail domain first' })
    }
    const res = await sudo(['panel-mail', 'gen-dkim', Body.data.domain], { timeoutMs: 60_000 })
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    const record = res.stdout.trim().split('\n').find((l) => l.startsWith('DKIM-RECORD: '))?.slice(13) ?? ''
    audit('mail.dkim.gen', { domain: Body.data.domain })
    return { ok: true, record }
  })

  app.get('/api/mail/dkim-record', { preHandler: [requireAuth] }, async (req, reply) => {
    const domain = String((req.query as { domain?: string }).domain ?? '').toLowerCase()
    if (!DOMAIN_RE.test(domain)) return reply.code(400).send({ error: 'Invalid domain' })
    const res = await sudo(['panel-mail', 'dkim-record', domain])
    if (res.code !== 0) return reply.code(404).send({ error: helperError(res) })
    return { record: res.stdout.trim() }
  })

  app.delete('/api/mail/dkim', { preHandler: [requireAuth] }, async (req, reply) => {
    const domain = String((req.query as { domain?: string }).domain ?? '').toLowerCase()
    if (!DOMAIN_RE.test(domain)) return reply.code(400).send({ error: 'Invalid domain' })
    const res = await sudo(['panel-mail', 'del-dkim', domain])
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    audit('mail.dkim.del', { domain })
    return { ok: true }
  })

  app.post('/api/mail/domain', { preHandler: [requireAuth] }, async (req, reply) => {
    if (!mailInstalled()) return reply.code(400).send({ error: 'Mail stack is not installed — run provisioning on the server' })
    const Body = z.object({ domain: z.string().trim().toLowerCase().regex(DOMAIN_RE, 'Invalid domain') }).safeParse(req.body)
    if (!Body.success) return reply.code(400).send({ error: Body.error.issues[0]?.message })
    const res = await sudo(['panel-mail', 'add-domain', Body.data.domain])
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    db.prepare('INSERT OR IGNORE INTO mail_domains (domain) VALUES (?)').run(Body.data.domain)
    audit('mail.domain.add', Body.data)
    return { ok: true }
  })

  app.delete('/api/mail/domain/:domain', { preHandler: [requireAuth] }, async (req, reply) => {
    const domain = decodeURIComponent((req.params as { domain: string }).domain).toLowerCase()
    if (!DOMAIN_RE.test(domain)) return reply.code(400).send({ error: 'Invalid domain' })
    const purge = (req.query as { purge?: string }).purge === '1'
    const res = await sudo(['panel-mail', 'del-domain', domain, ...(purge ? ['--purge'] : [])])
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    db.prepare('DELETE FROM mail_domains WHERE domain = ?').run(domain)
    db.prepare("DELETE FROM mail_boxes WHERE address LIKE ?").run(`%@${domain}`)
    db.prepare("DELETE FROM mail_aliases WHERE address LIKE ?").run(`%@${domain}`)
    audit('mail.domain.del', { domain, purge })
    return { ok: true }
  })

  app.post('/api/mail/box', { preHandler: [requireAuth] }, async (req, reply) => {
    const Body = z
      .object({
        domain: z.string().regex(DOMAIN_RE),
        localpart: z.string().regex(LOCAL_RE, 'Local part invalid (a-z 0-9 . _ - ; max 30)'),
        password: z.string().regex(PASS_RE, 'Password invalid (8-64; letters/digits/._@+-)').optional(),
      })
      .safeParse(req.body)
    if (!Body.success) return reply.code(400).send({ error: Body.error.issues[0]?.message })
    const password = Body.data.password ?? genPassword()
    const address = `${Body.data.localpart}@${Body.data.domain}`
    const res = await sudo(['panel-mail', 'add-mailbox', Body.data.domain, Body.data.localpart, password])
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    db.prepare('INSERT OR IGNORE INTO mail_boxes (address, password) VALUES (?, ?)').run(address, password)
    audit('mail.box.add', { address })
    return { ok: true, address, password }
  })

  app.delete('/api/mail/box', { preHandler: [requireAuth] }, async (req, reply) => {
    const Body = z.object({ domain: z.string().regex(DOMAIN_RE), localpart: z.string().regex(LOCAL_RE) }).safeParse(req.query)
    if (!Body.success) return reply.code(400).send({ error: 'Invalid mailbox' })
    const res = await sudo(['panel-mail', 'del-mailbox', Body.data.domain, Body.data.localpart])
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    db.prepare('DELETE FROM mail_boxes WHERE address = ?').run(`${Body.data.localpart}@${Body.data.domain}`)
    audit('mail.box.del', { address: `${Body.data.localpart}@${Body.data.domain}` })
    return { ok: true }
  })

  app.post('/api/mail/box/passwd', { preHandler: [requireAuth] }, async (req, reply) => {
    const Body = z.object({
      domain: z.string().regex(DOMAIN_RE),
      localpart: z.string().regex(LOCAL_RE),
      password: z.string().regex(PASS_RE).optional(),
    }).safeParse(req.body)
    if (!Body.success) return reply.code(400).send({ error: Body.error.issues[0]?.message })
    const password = Body.data.password ?? genPassword()
    const address = `${Body.data.localpart}@${Body.data.domain}`
    const res = await sudo(['panel-mail', 'passwd', Body.data.domain, Body.data.localpart, password])
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    db.prepare('UPDATE mail_boxes SET password = ? WHERE address = ?').run(password, address)
    audit('mail.box.passwd', { address })
    return { ok: true, password }
  })

  app.post('/api/mail/alias', { preHandler: [requireAuth] }, async (req, reply) => {
    const Body = z.object({
      domain: z.string().regex(DOMAIN_RE),
      alias: z.string().regex(LOCAL_RE, 'Alias local part invalid'),
      target: z.string().toLowerCase().regex(ADDR_RE, 'Target must be a full email address'),
    }).safeParse(req.body)
    if (!Body.success) return reply.code(400).send({ error: Body.error.issues[0]?.message })
    const res = await sudo(['panel-mail', 'add-alias', Body.data.domain, Body.data.alias, Body.data.target])
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    const address = `${Body.data.alias}@${Body.data.domain}`
    db.prepare('INSERT OR IGNORE INTO mail_aliases (address, target) VALUES (?, ?)').run(address, Body.data.target)
    audit('mail.alias.add', { address, target: Body.data.target })
    return { ok: true }
  })

  app.delete('/api/mail/alias', { preHandler: [requireAuth] }, async (req, reply) => {
    const Body = z.object({ domain: z.string().regex(DOMAIN_RE), alias: z.string().regex(LOCAL_RE) }).safeParse(req.query)
    if (!Body.success) return reply.code(400).send({ error: 'Invalid alias' })
    const res = await sudo(['panel-mail', 'del-alias', Body.data.domain, Body.data.alias])
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    db.prepare('DELETE FROM mail_aliases WHERE address = ?').run(`${Body.data.alias}@${Body.data.domain}`)
    audit('mail.alias.del', {})
    return { ok: true }
  })

  app.post('/api/mail/webmail', { preHandler: [requireAuth] }, async (req, reply) => {
    const Body = z
      .object({
        target: z.enum(['panel', 'site']).default('panel'),
        siteId: z.number().int().positive().optional(),
      })
      .safeParse(req.body)
    if (!Body.success) return reply.code(400).send({ error: 'Invalid request' })

    if (Body.data.target === 'panel') {
      const res = await sudo(['panel-install-webmail', 'panel'])
      if (res.code !== 0) {
        audit('mail.webmail.failed', { target: 'panel', error: helperError(res) })
        return reply.code(500).send({ error: helperError(res) })
      }
      audit('mail.webmail', { target: 'panel' })
      return { ok: true, output: tail(res.stdout) }
    }

    if (!Body.data.siteId) return reply.code(400).send({ error: 'Choose a PHP site' })
    const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(Body.data.siteId) as
      | { id: number; domain: string; type: string }
      | undefined
    if (!site || site.type !== 'php') return reply.code(400).send({ error: 'Webmail needs a PHP site' })
    const res = await sudo(['panel-install-webmail', site.domain])
    if (res.code !== 0) {
      audit('mail.webmail.failed', { domain: site.domain, error: helperError(res) })
      return reply.code(500).send({ error: helperError(res) })
    }
    audit('mail.webmail', { domain: site.domain })
    return { ok: true, output: tail(res.stdout) }
  })
}
