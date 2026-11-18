import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { audit, getMeta, setMeta } from './db'
import { sudo, tail } from './exec'
import { requireAuth } from './auth'
import { notify } from './notify'

interface BackupFile {
  dir: string
  file: string
  size: number
}

interface BackupSettings {
  enabled: boolean
  time: string
  retention: number
  scope: 'all' | 'sites' | 'db'
}

function helperError(res: { code: number; stdout: string; stderr: string }): string {
  return tail(res.stderr || res.stdout) || `helper exited with code ${res.code}`
}

function parseList(stdout: string): BackupFile[] {
  const out: BackupFile[] = []
  for (const line of stdout.trim().split('\n')) {
    const [dir, file, size] = line.split('|')
    if (dir && file && size) out.push({ dir, file, size: Number(size) })
  }
  return out
}

function readSettings(): BackupSettings {
  const scope = getMeta('backup_scope', 'all')
  const retention = Number(getMeta('backup_retention', '14'))
  return {
    enabled: getMeta('backup_enabled', '1') === '1',
    time: getMeta('backup_time', '02:30'),
    retention: Number.isFinite(retention) && retention >= 1 && retention <= 90 ? retention : 14,
    scope: scope === 'sites' || scope === 'db' ? scope : 'all',
  }
}

const SettingsBody = z.object({
  enabled: z.boolean(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM (00:00-23:59)'),
  retention: z.number().int().min(1).max(90, 'Retention must be between 1 and 90 sets'),
  scope: z.enum(['all', 'sites', 'db']),
})

const PathArgs = z.object({
  dir: z.string().regex(/^\d{8}-\d{6}$/, 'Invalid backup set name'),
  file: z.string().regex(/^[A-Za-z0-9._-]+$/, 'Invalid file name'),
})

export async function backupsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/backups/settings', { preHandler: [requireAuth] }, async () => {
    return readSettings()
  })

  app.put('/api/backups/settings', { preHandler: [requireAuth] }, async (req, reply) => {
    const parsed = SettingsBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid input' })
    }
    const s = parsed.data
    setMeta('backup_enabled', s.enabled ? '1' : '0')
    setMeta('backup_time', s.time)
    setMeta('backup_retention', String(s.retention))
    setMeta('backup_scope', s.scope)

    // Apply: rewrite the cron entry, then prune immediately with the new retention
    const sched = await sudo(['panel-backup', 'schedule'])
    if (sched.code !== 0) return reply.code(500).send({ error: helperError(sched) })
    await sudo(['panel-backup', 'prune'])
    audit('backup.settings', s)
    return { ok: true, output: tail(sched.stdout), settings: readSettings() }
  })

  app.get('/api/backups', { preHandler: [requireAuth] }, async () => {
    const res = await sudo(['panel-backup', 'list'])
    if (res.code !== 0) return { backups: [] }
    return { backups: parseList(res.stdout) }
  })

  // Manual run — optional scope in the body (default: everything)
  app.post('/api/backups/run', { preHandler: [requireAuth] }, async (req, reply) => {
    const Body = z.object({ scope: z.enum(['all', 'sites', 'db']).default('all') }).safeParse(req.body ?? {})
    if (!Body.success) return reply.code(400).send({ error: 'Invalid scope' })
    const res = await sudo(['panel-backup', 'run', `--scope=${Body.data.scope}`], { timeoutMs: 600_000 })
    if (res.code !== 0) {
      audit('backup.run.failed', { scope: Body.data.scope, error: helperError(res) })
      await notify('Backup failed', `${tail(res.stderr || res.stdout, 800)}`)
      return reply.code(500).send({ error: helperError(res) })
    }
    audit('backup.run', { scope: Body.data.scope })
    return { ok: true, output: tail(res.stdout) }
  })

  // Download a backup file (streamed via helper stdout)
  app.get('/api/backups/download', { preHandler: [requireAuth] }, async (req, reply) => {
    const parsed = PathArgs.safeParse(req.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid backup path' })
    const res = await sudo(['panel-backup', 'cat', parsed.data.dir, parsed.data.file], { timeoutMs: 300_000 })
    if (res.code !== 0) return reply.code(404).send({ error: helperError(res) })
    reply.header('content-disposition', `attachment; filename="${parsed.data.file}"`)
    reply.header('content-type', 'application/octet-stream')
    return res.stdout
  })

  app.delete('/api/backups/file', { preHandler: [requireAuth] }, async (req, reply) => {
    const parsed = PathArgs.safeParse(req.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid backup path' })
    const res = await sudo(['panel-backup', 'delete', parsed.data.dir, parsed.data.file])
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    audit('backup.delete', parsed.data)
    return { ok: true }
  })

  // Restore: kind derived from the file name (site-*.tar.gz / db-*.sql.gz)
  app.post('/api/backups/restore', { preHandler: [requireAuth] }, async (req, reply) => {
    const parsed = PathArgs.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid backup path' })
    const { dir, file } = parsed.data

    const action = file.startsWith('db-') && file.endsWith('.sql.gz')
      ? 'restore-db'
      : file.startsWith('site-') && file.endsWith('.tar.gz')
        ? 'restore-site'
        : null
    if (!action) return reply.code(400).send({ error: 'File is not a recognized site archive/database dump' })

    const res = await sudo(['panel-backup', action, dir, file], { timeoutMs: 600_000 })
    if (res.code !== 0) {
      audit('backup.restore.failed', { dir, file, error: helperError(res) })
      return reply.code(500).send({ error: helperError(res) })
    }
    audit('backup.restore', { dir, file, action })
    return { ok: true, output: tail(res.stdout) }
  })
}
