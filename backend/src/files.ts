import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { audit, db, type SiteRow } from './db'
import { sudo, tail } from './exec'
import { requireAuth } from './auth'

const REL_RE = /^[A-Za-z0-9._+@/ -]{0,255}$/

const RelPath = z
  .string()
  .regex(REL_RE, 'Path contains unsupported characters (spaces/unicode not supported yet)')
  .refine((p) => !p.startsWith('/') && p.split('/').every((s) => !s || (s !== '.' && s !== '..')), {
    message: 'Path must be relative to the site root without . / .. segments',
  })

function getSite(id: number): SiteRow | undefined {
  return db.prepare('SELECT * FROM sites WHERE id = ?').get(id) as SiteRow | undefined
}

function helperError(res: { code: number; stdout: string; stderr: string }): string {
  return tail(res.stderr || res.stdout) || `helper exited with code ${res.code}`
}

function parseList(stdout: string): { type: string; size: number; mtime: string; name: string }[] {
  const out: { type: string; size: number; mtime: string; name: string }[] = []
  for (const line of stdout.trim().split('\n')) {
    const [type, size, mtime, ...nameParts] = line.split('\t')
    if (!type || !nameParts.length) continue
    out.push({ type, size: Number(size) || 0, mtime, name: nameParts.join('\t') })
  }
  return out
}

export async function filesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/sites/:id/fs', { preHandler: [requireAuth] }, async (req, reply) => {
    const site = getSite(Number((req.params as { id: string }).id))
    if (!site) return reply.code(404).send({ error: 'Site not found' })
    const parsed = RelPath.default('').safeParse((req.query as { path?: string }).path ?? '')
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message })
    const res = await sudo(['panel-file', site.domain, 'list', parsed.data])
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    return { path: parsed.data, entries: parseList(res.stdout) }
  })

  app.get('/api/sites/:id/fs/read', { preHandler: [requireAuth] }, async (req, reply) => {
    const site = getSite(Number((req.params as { id: string }).id))
    if (!site) return reply.code(404).send({ error: 'Site not found' })
    const parsed = RelPath.safeParse((req.query as { path?: string }).path)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid path' })
    const res = await sudo(['panel-file', site.domain, 'read', parsed.data])
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    return { path: parsed.data, content: res.stdout }
  })

  app.get('/api/sites/:id/fs/download', { preHandler: [requireAuth] }, async (req, reply) => {
    const site = getSite(Number((req.params as { id: string }).id))
    if (!site) return reply.code(404).send({ error: 'Site not found' })
    const parsed = RelPath.safeParse((req.query as { path?: string }).path)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid path' })
    const res = await sudo(['panel-file', site.domain, 'download', parsed.data], { timeoutMs: 120_000 })
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    const name = parsed.data.split('/').pop() ?? 'file'
    reply.header('content-disposition', `attachment; filename="${name}"`)
    reply.header('content-type', 'application/octet-stream')
    return res.stdout
  })

  app.put('/api/sites/:id/fs/write', { preHandler: [requireAuth] }, async (req, reply) => {
    const site = getSite(Number((req.params as { id: string }).id))
    if (!site) return reply.code(404).send({ error: 'Site not found' })
    const Body = z.object({ path: RelPath, content: z.string().max(2_000_000) }).safeParse(req.body)
    if (!Body.success) return reply.code(400).send({ error: Body.error.issues[0]?.message })
    const res = await sudo(['panel-file', site.domain, 'write', Body.data.path], { input: Body.data.content })
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    audit('file.write', { domain: site.domain, path: Body.data.path })
    return { ok: true }
  })

  app.post('/api/sites/:id/fs/mkdir', { preHandler: [requireAuth] }, async (req, reply) => {
    const site = getSite(Number((req.params as { id: string }).id))
    if (!site) return reply.code(404).send({ error: 'Site not found' })
    const Body = z.object({ path: RelPath }).safeParse(req.body)
    if (!Body.success) return reply.code(400).send({ error: Body.error.issues[0]?.message })
    const res = await sudo(['panel-file', site.domain, 'mkdir', Body.data.path])
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    audit('file.mkdir', { domain: site.domain, path: Body.data.path })
    return { ok: true }
  })

  app.post('/api/sites/:id/fs/upload', { preHandler: [requireAuth] }, async (req, reply) => {
    const site = getSite(Number((req.params as { id: string }).id))
    if (!site) return reply.code(404).send({ error: 'Site not found' })
    const Body = z
      .object({ path: RelPath, contentBase64: z.string().regex(/^[A-Za-z0-9+/=\r\n]+$/, 'Invalid base64').max(14_000_000) })
      .safeParse(req.body)
    if (!Body.success) return reply.code(400).send({ error: 'Upload payload invalid (max ~10MB)' })
    const res = await sudo(['panel-file', site.domain, 'upload', Body.data.path], { input: Body.data.contentBase64 })
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    audit('file.upload', { domain: site.domain, path: Body.data.path })
    return { ok: true }
  })

  app.post('/api/sites/:id/fs/rename', { preHandler: [requireAuth] }, async (req, reply) => {
    const site = getSite(Number((req.params as { id: string }).id))
    if (!site) return reply.code(404).send({ error: 'Site not found' })
    const Body = z.object({ from: RelPath, to: RelPath }).safeParse(req.body)
    if (!Body.success) return reply.code(400).send({ error: Body.error.issues[0]?.message })
    const res = await sudo(['panel-file', site.domain, 'rename', Body.data.from, Body.data.to])
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    audit('file.rename', { domain: site.domain, from: Body.data.from, to: Body.data.to })
    return { ok: true }
  })

  app.delete('/api/sites/:id/fs', { preHandler: [requireAuth] }, async (req, reply) => {
    const site = getSite(Number((req.params as { id: string }).id))
    if (!site) return reply.code(404).send({ error: 'Site not found' })
    const parsed = RelPath.safeParse((req.query as { path?: string }).path)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid path' })
    if (!parsed.data) return reply.code(400).send({ error: 'Refusing to delete the site root' })
    const res = await sudo(['panel-file', site.domain, 'rm', parsed.data])
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    audit('file.rm', { domain: site.domain, path: parsed.data })
    return { ok: true }
  })
}
