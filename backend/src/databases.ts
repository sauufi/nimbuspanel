import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { audit, db } from './db'
import { sudo, tail } from './exec'
import { requireAuth } from './auth'

interface DbRow {
  id: number
  site_id: number | null
  name: string
  db_user: string
  db_pass: string
  created_at: string
}

const NAME_RE = /^[a-z][a-z0-9_]{0,38}$/

function helperError(res: { code: number; stdout: string; stderr: string }): string {
  return tail(res.stderr || res.stdout) || `helper exited with code ${res.code}`
}

function genPassword(): string {
  // charset sama dengan validasi helper (tanpa kutip/spasi)
  return crypto.randomBytes(18).toString('base64url').replace(/[^A-Za-z0-9._@+-]/g, 'x').slice(0, 24)
}

export async function databasesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/db', { preHandler: [requireAuth] }, async () => {
    const rows = db.prepare('SELECT * FROM databases ORDER BY name').all() as DbRow[]
    // ukuran live dari server
    const res = await sudo(['panel-db-manage', 'list'])
    const sizes = new Map<string, { mb: number; tables: number }>()
    if (res.code === 0) {
      for (const line of res.stdout.trim().split('\n')) {
        const [name, mb, tables] = line.split('\t')
        if (name) sizes.set(name, { mb: Number(mb) || 0, tables: Number(tables) || 0 })
      }
    }
    return {
      databases: rows.map((r) => ({
        ...r,
        sizeMb: sizes.get(r.name)?.mb ?? 0,
        tables: sizes.get(r.name)?.tables ?? 0,
        exists: sizes.has(r.name),
      })),
    }
  })

  app.post('/api/db', { preHandler: [requireAuth] }, async (req, reply) => {
    const Body = z.object({
      siteId: z.number().int().positive().nullable(),
      name: z.string().trim().toLowerCase().regex(NAME_RE, 'Name may only contain a-z, 0-9, _ (max 39 chars, must start with a letter)'),
    })
    const parsed = Body.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid input' })
    }
    const { siteId, name } = parsed.data

    if (db.prepare('SELECT 1 FROM databases WHERE name = ?').get(name)) {
      return reply.code(409).send({ error: `Database ${name} already exists in the panel` })
    }

    const dbUser = `u_${name}`.slice(0, 39)
    const dbPass = genPassword()
    const res = await sudo(['panel-db-manage', 'create', name, dbUser, dbPass])
    if (res.code !== 0) {
      audit('db.create.failed', { name, error: helperError(res) })
      return reply.code(500).send({ error: helperError(res) })
    }
    const info = db
      .prepare('INSERT INTO databases (site_id, name, db_user, db_pass) VALUES (?, ?, ?, ?)')
      .run(siteId, name, dbUser, dbPass)
    audit('db.create', { name, siteId })
    return {
      ok: true,
      database: { id: Number(info.lastInsertRowid), name, dbUser, dbPass },
    }
  })

  app.post('/api/db/:id/password', { preHandler: [requireAuth] }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM databases WHERE id = ?').get(Number((req.params as { id: string }).id)) as DbRow | undefined
    if (!row) return reply.code(404).send({ error: 'Database not found' })
    const newPass = genPassword()
    const res = await sudo(['panel-db-manage', 'passwd', row.db_user, newPass])
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    db.prepare('UPDATE databases SET db_pass = ? WHERE id = ?').run(newPass, row.id)
    audit('db.password', { name: row.name })
    return { ok: true, dbPass: newPass }
  })

  // Dump SQL → unduhan teks
  app.get('/api/db/:id/dump', { preHandler: [requireAuth] }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM databases WHERE id = ?').get(Number((req.params as { id: string }).id)) as DbRow | undefined
    if (!row) return reply.code(404).send({ error: 'Database not found' })
    const res = await sudo(['panel-db-manage', 'dump', row.name], { timeoutMs: 300_000 })
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    audit('db.dump', { name: row.name, bytes: res.stdout.length })
    reply.header('content-disposition', `attachment; filename="${row.name}.sql"`)
    reply.header('content-type', 'application/sql; charset=utf-8')
    return res.stdout
  })

  // Import SQL dari body teks
  app.post('/api/db/:id/import', { preHandler: [requireAuth] }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM databases WHERE id = ?').get(Number((req.params as { id: string }).id)) as DbRow | undefined
    if (!row) return reply.code(404).send({ error: 'Database not found' })
    const body =
      typeof req.body === 'string' ? req.body : String((req.body as { sql?: string } | undefined)?.sql ?? '')
    if (!body.trim()) return reply.code(400).send({ error: 'SQL content is empty' })
    if (body.length > 64 * 1024 * 1024) return reply.code(413).send({ error: 'SQL file too large (max 64MB) — split it or use SSH' })

    const res = await sudo(['panel-db-manage', 'import', row.name], { input: body, timeoutMs: 600_000 })
    if (res.code !== 0) {
      audit('db.import.failed', { name: row.name, error: helperError(res) })
      return reply.code(500).send({ error: helperError(res) })
    }
    audit('db.import', { name: row.name, bytes: body.length })
    return { ok: true }
  })

  app.delete('/api/db/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM databases WHERE id = ?').get(Number((req.params as { id: string }).id)) as DbRow | undefined
    if (!row) return reply.code(404).send({ error: 'Database not found' })
    const res = await sudo(['panel-db-manage', 'drop', row.name, row.db_user])
    if (res.code !== 0) {
      audit('db.drop.failed', { name: row.name, error: helperError(res) })
      return reply.code(500).send({ error: helperError(res) })
    }
    db.prepare('DELETE FROM databases WHERE id = ?').run(row.id)
    audit('db.drop', { name: row.name })
    return { ok: true }
  })
}
