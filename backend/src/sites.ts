import fs from 'node:fs'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { allocateNodePort, audit, db, type SiteRow } from './db'
import { sudo, tail } from './exec'
import { requireAuth } from './auth'
import { installedPhpVersions } from './system'
import { convertHtaccess } from './htaccess'
import { notify } from './notify'

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/
const CMD_RE = /^[a-zA-Z0-9 ./_:=@-]*$/ // charset sama dengan helper — tanpa ; | & $ ` >
const BRANCH_RE = /^[a-zA-Z0-9._/-]+$/
const REPO_RE = /^(https:\/\/[a-zA-Z0-9./_:~@-]+|\/[a-zA-Z0-9./_-]+)$/

const CreateSite = z
  .object({
    domain: z.string().trim().toLowerCase().max(253).regex(DOMAIN_RE, 'Invalid domain format'),
    type: z.enum(['php', 'node']),
    phpVersion: z
      .string()
      .regex(/^\d+\.\d+$/)
      .optional(),
    webServer: z.enum(['nginx', 'apache']).default('nginx'),
  })
  .refine((d) => d.type !== 'php' || !!d.phpVersion, {
    message: 'PHP version is required for PHP sites',
    path: ['phpVersion'],
  })
  .refine((d) => d.type !== 'node' || d.webServer === 'nginx', {
    message: 'Apache mode is only available for PHP sites',
    path: ['webServer'],
  })

const NodeSettings = z.object({
  repoUrl: z.string().min(1).max(300).regex(REPO_RE, 'Repo must be a public https:// URL or an absolute path'),
  branch: z.string().max(100).regex(BRANCH_RE).default('main'),
  nodeVersion: z.string().regex(/^\d+$/, 'Invalid Node version'),
  buildCmd: z.string().max(300).regex(CMD_RE, 'Build command contains forbidden characters').default(''),
  startCmd: z
    .string()
    .min(1)
    .max(300)
    .regex(CMD_RE, 'Start command contains forbidden characters'),
})

function getSite(id: number): SiteRow | undefined {
  return db.prepare('SELECT * FROM sites WHERE id = ?').get(id) as SiteRow | undefined
}

function helperError(res: { code: number; stdout: string; stderr: string }): string {
  return tail(res.stderr || res.stdout) || `helper exited with code ${res.code}`
}

export function installedNodeVersions(): string[] {
  try {
    return fs
      .readdirSync('/opt/node')
      .filter((d) => /^v\d+$/.test(d))
      .map((d) => d.slice(1))
      .sort((a, b) => Number(b) - Number(a))
  } catch {
    return []
  }
}

/** Info deploy node: rilis aktif (dibaca symlink current) + status unit */
function nodeInfo(site: SiteRow) {
  let currentRelease: string | null = null
  try {
    currentRelease = fs
      .readlinkSync(`/var/www/${site.domain}/current`)
      .split('/')
      .pop() ?? null
  } catch {
    currentRelease = null
  }
  return { unit: `app-${site.id}`, currentRelease }
}

export async function sitesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/sites', { preHandler: [requireAuth] }, async () => {
    return { sites: db.prepare('SELECT * FROM sites ORDER BY domain').all() }
  })

  // Opsi untuk form: versi PHP + versi Node terpasang
  app.get('/api/sites/options', { preHandler: [requireAuth] }, async () => {
    return { phpVersions: installedPhpVersions(), nodeVersions: installedNodeVersions() }
  })

  app.get('/api/sites/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const site = getSite(id)
    if (!site) return reply.code(404).send({ error: 'Site not found' })

    const unit = site.type === 'php' ? `php${site.php_version}-fpm` : `app-${site.id}`
    const res = await sudo(['panel-systemctl', 'is-active', unit])
    const service = { unit, active: res.code === 0 && res.stdout.trim() === 'active' }

    return {
      site,
      docroot: `/var/www/${site.domain}/htdocs`,
      sslDir: `/etc/nginx/ssl/${site.domain}`,
      service,
      ...(site.type === 'node' ? { node: nodeInfo(site) } : {}),
    }
  })

  app.post('/api/sites', { preHandler: [requireAuth] }, async (req, reply) => {
    const parsed = CreateSite.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid input' })
    }
    const { domain, type, phpVersion, webServer } = parsed.data

    if (db.prepare('SELECT 1 FROM sites WHERE domain = ?').get(domain)) {
      return reply.code(409).send({ error: `Site ${domain} already exists` })
    }
    if (type === 'php' && !installedPhpVersions().includes(phpVersion!)) {
      return reply.code(400).send({ error: `PHP ${phpVersion} is not installed on the server` })
    }
    if (webServer === 'apache' && !fs.existsSync('/etc/apache2')) {
      return reply.code(400).send({ error: 'Apache mode is not installed — run provisioning on the server' })
    }

    const nodePort = type === 'node' ? allocateNodePort() : null
    const res = await sudo([
      'panel-provision-site',
      domain,
      type,
      type === 'php' ? phpVersion! : String(nodePort),
      ...(type === 'php' && webServer === 'apache' ? ['--apache'] : []),
    ])
    if (res.code !== 0) {
      audit('site.create.failed', { domain, type, error: helperError(res) })
      return reply.code(500).send({ error: helperError(res) })
    }

    const info = db
      .prepare('INSERT INTO sites (domain, type, php_version, node_port, web_server) VALUES (?, ?, ?, ?, ?)')
      .run(domain, type, phpVersion ?? null, nodePort, webServer)
    audit('site.create', { domain, type, phpVersion, nodePort, webServer })
    return { ok: true, site: getSite(Number(info.lastInsertRowid)) }
  })

  // ---- Fase 2: pengaturan & pipeline deploy Node.js ----

  app.put('/api/sites/:id/settings', { preHandler: [requireAuth] }, async (req, reply) => {
    const site = getSite(Number((req.params as { id: string }).id))
    if (!site) return reply.code(404).send({ error: 'Site not found' })
    if (site.type !== 'node') return reply.code(400).send({ error: 'Deploy settings are only for Node.js sites' })

    const parsed = NodeSettings.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid input' })
    }
    if (!installedNodeVersions().includes(parsed.data.nodeVersion)) {
      return reply.code(400).send({ error: `Node v${parsed.data.nodeVersion} tidak terpasang di server` })
    }

    db.prepare(
      `UPDATE sites SET repo_url=?, branch=?, node_version=?, build_cmd=?, start_cmd=? WHERE id=?`,
    ).run(
      parsed.data.repoUrl,
      parsed.data.branch,
      parsed.data.nodeVersion,
      parsed.data.buildCmd,
      parsed.data.startCmd,
      site.id,
    )
    audit('site.settings', { domain: site.domain, ...parsed.data })
    return { ok: true, site: getSite(site.id) }
  })

  app.post('/api/sites/:id/deploy', { preHandler: [requireAuth] }, async (req, reply) => {
    const site = getSite(Number((req.params as { id: string }).id))
    if (!site) return reply.code(404).send({ error: 'Site not found' })
    if (site.type !== 'node') return reply.code(400).send({ error: 'Deploy is only for Node.js sites' })
    if (!site.repo_url || !site.node_version || !site.start_cmd) {
      return reply.code(400).send({ error: 'Complete the deploy settings first (repo, Node version, start command)' })
    }

    const res = await sudo(
      [
        'panel-node-deploy',
        site.domain,
        String(site.id),
        site.repo_url,
        site.branch ?? 'main',
        site.node_version,
        site.build_cmd ?? '',
        site.start_cmd,
        String(site.node_port ?? 0),
      ],
      { timeoutMs: 600_000 }, // npm install + build bisa lama
    )
    const output = tail(res.stdout || res.stderr, 4000)
    if (res.code !== 0) {
      audit('site.deploy.failed', { domain: site.domain, error: tail(res.stderr || res.stdout) })
      await notify('Deploy failed', `${site.domain}: ${tail(res.stderr || res.stdout, 800)}`)
      return reply.code(500).send({ error: helperError(res), output })
    }
    audit('site.deploy', { domain: site.domain })
    return { ok: true, output }
  })

  app.post('/api/sites/:id/rollback', { preHandler: [requireAuth] }, async (req, reply) => {
    const site = getSite(Number((req.params as { id: string }).id))
    if (!site || site.type !== 'node') return reply.code(404).send({ error: 'Node site not found' })

    const res = await sudo(['panel-node-rollback', site.domain, String(site.id)])
    if (res.code !== 0) {
      audit('site.rollback.failed', { domain: site.domain, error: helperError(res) })
      return reply.code(500).send({ error: helperError(res) })
    }
    audit('site.rollback', { domain: site.domain })
    return { ok: true, output: tail(res.stdout) }
  })

  app.get('/api/sites/:id/env', { preHandler: [requireAuth] }, async (req, reply) => {
    const site = getSite(Number((req.params as { id: string }).id))
    if (!site || site.type !== 'node') return reply.code(404).send({ error: 'Node site not found' })
    const res = await sudo(['panel-read-env', site.domain])
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    return { env: res.stdout }
  })

  app.put('/api/sites/:id/env', { preHandler: [requireAuth] }, async (req, reply) => {
    const site = getSite(Number((req.params as { id: string }).id))
    if (!site || site.type !== 'node') return reply.code(404).send({ error: 'Node site not found' })

    const parsed = z.object({ env: z.string().max(20_000) }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid env content (max 20KB)' })

    const res = await sudo(['panel-write-env', site.domain], { input: parsed.data.env })
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    audit('site.env', { domain: site.domain, bytes: parsed.data.env.length })
    return { ok: true }
  })

  // Log live aplikasi via SSE (journalctl sebagai user panel — grup systemd-journal)
  app.get('/api/sites/:id/logs', { preHandler: [requireAuth] }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const site = getSite(id)
    if (!site || site.type !== 'node') return reply.code(404).send({ error: 'Node site not found' })

    const unit = `app-${id}` // id sudah Number — aman, tanpa shell
    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    reply.raw.write('data: [panel] streaming log…\n\n')

    const proc = spawn('/usr/bin/journalctl', ['-n', '200', '-f', '-u', `${unit}.service`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const onOut = (d: Buffer): void => {
      reply.raw.write(`data: ${d.toString().replace(/\n/g, '\ndata: ')}\n\n`)
    }
    proc.stdout.on('data', onOut)
    proc.stderr.on('data', (d) => reply.raw.write(`data: [journalctl] ${d.toString()}\n\n`))
    req.raw.on('close', () => proc.kill('SIGTERM'))
    proc.on('close', () => {
      try {
        reply.raw.write('data: [panel] stream berakhir\n\n')
        reply.raw.end()
      } catch {
        /* koneksi sudah tutup */
      }
    })
  })

  // ---- Custom nginx rules & .htaccess conversion (php + nginx mode) ----

  app.post('/api/sites/:id/htaccess-convert', { preHandler: [requireAuth] }, async (req, reply) => {
    const site = getSite(Number((req.params as { id: string }).id))
    if (!site || site.type !== 'php') return reply.code(404).send({ error: 'PHP site not found' })
    const parsed = z.object({ content: z.string().min(1).max(200_000) }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Content is required' })
    return convertHtaccess(parsed.data.content)
  })

  app.get('/api/sites/:id/rules', { preHandler: [requireAuth] }, async (req, reply) => {
    const site = getSite(Number((req.params as { id: string }).id))
    if (!site || site.type !== 'php') return reply.code(404).send({ error: 'PHP site not found' })
    if (site.web_server === 'apache') {
      return reply.code(400).send({ error: 'This site uses Apache — .htaccess works natively, no conversion needed' })
    }
    const res = await sudo(['panel-read-nginx-rules', site.domain])
    if (res.code !== 0) return reply.code(500).send({ error: helperError(res) })
    return { rules: res.stdout }
  })

  app.put('/api/sites/:id/rules', { preHandler: [requireAuth] }, async (req, reply) => {
    const site = getSite(Number((req.params as { id: string }).id))
    if (!site || site.type !== 'php') return reply.code(404).send({ error: 'PHP site not found' })
    if (site.web_server === 'apache') {
      return reply.code(400).send({ error: 'This site uses Apache — .htaccess works natively, no conversion needed' })
    }
    const parsed = z.object({ rules: z.string().max(64_000) }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Rules content is invalid (max 64KB)' })

    const res = await sudo(['panel-write-nginx-rules', site.domain], { input: parsed.data.rules })
    if (res.code !== 0) {
      audit('site.rules.failed', { domain: site.domain, error: helperError(res) })
      return reply.code(500).send({ error: helperError(res) })
    }
    audit('site.rules', { domain: site.domain, bytes: parsed.data.rules.length })
    return { ok: true, output: tail(res.stdout) }
  })

  // ---- Deploy webhook (PUBLIC — verified by signature/token, no cookie) ----

  app.post('/api/hooks/:siteId', async (req, reply) => {
    const site = getSite(Number((req.params as { siteId: string }).siteId))
    if (!site || site.type !== 'node' || !site.deploy_secret) {
      return reply.code(404).send({ error: 'not found' })
    }
    if (!site.repo_url || !site.node_version || !site.start_cmd) {
      return reply.code(400).send({ error: 'Deploy settings incomplete — configure the site first' })
    }
    const secret = site.deploy_secret

    // GitHub sends X-Hub-Signature-256 (HMAC-SHA256 of the raw body);
    // GitLab sends X-Gitlab-Token (plain shared secret).
    const sig = req.headers['x-hub-signature-256']
    const token =
      (req.headers['x-gitlab-token'] as string | undefined) ?? (req.query as { secret?: string }).secret
    if (typeof sig === 'string') {
      const raw = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0)
      const expect = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`
      const a = Buffer.from(sig)
      const b = Buffer.from(expect)
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return reply.code(401).send({ error: 'invalid signature' })
      }
    } else if (typeof token === 'string') {
      if (token !== secret) return reply.code(401).send({ error: 'invalid token' })
    } else {
      return reply.code(401).send({ error: 'missing signature or token' })
    }

    // Branch filter — GitHub & GitLab both put the full ref in "ref"
    const ref = (req.body as { ref?: string })?.ref
    if (ref && site.branch && ref !== `refs/heads/${site.branch}`) {
      return { ok: true, message: `push to ${ref} ignored (watching ${site.branch})` }
    }

    // Trigger the deploy in the background — webhook senders expect a fast response
    void (async () => {
      const res = await sudo(
        [
          'panel-node-deploy',
          site.domain,
          String(site.id),
          site.repo_url!,
          site.branch ?? 'main',
          site.node_version!,
          site.build_cmd ?? '',
          site.start_cmd!,
          String(site.node_port ?? 0),
        ],
        { timeoutMs: 600_000 },
      )
      audit(res.code === 0 ? 'webhook.deploy' : 'webhook.deploy.failed', {
        domain: site.domain,
        ...(res.code !== 0 ? { error: tail(res.stderr || res.stdout) } : {}),
      })
      if (res.code !== 0) {
        await notify('Auto-deploy failed (webhook)', `${site.domain}: ${tail(res.stderr || res.stdout, 800)}`)
      }
    })()

    return { ok: true, message: 'deploy triggered' }
  })

  app.post('/api/sites/:id/webhook-secret', { preHandler: [requireAuth] }, async (req, reply) => {
    const site = getSite(Number((req.params as { id: string }).id))
    if (!site || site.type !== 'node') return reply.code(404).send({ error: 'Node site not found' })
    const secret = crypto.randomBytes(24).toString('hex')
    db.prepare('UPDATE sites SET deploy_secret = ? WHERE id = ?').run(secret, site.id)
    audit('site.webhook-secret', { domain: site.domain })
    return { ok: true, secret }
  })

  // ---- Adminer (one-click DB UI on a PHP site) ----

  app.post('/api/sites/:id/adminer', { preHandler: [requireAuth] }, async (req, reply) => {
    const site = getSite(Number((req.params as { id: string }).id))
    if (!site || site.type !== 'php') return reply.code(404).send({ error: 'PHP site not found' })
    const res = await sudo(['panel-install-adminer', site.domain])
    if (res.code !== 0) {
      audit('site.adminer.failed', { domain: site.domain, error: helperError(res) })
      return reply.code(500).send({ error: helperError(res) })
    }
    audit('site.adminer', { domain: site.domain })
    return { ok: true, output: tail(res.stdout) }
  })

  // ---- WordPress one-click install (php sites) ----

  app.post('/api/sites/:id/wordpress', { preHandler: [requireAuth] }, async (req, reply) => {
    const site = getSite(Number((req.params as { id: string }).id))
    if (!site || site.type !== 'php') return reply.code(404).send({ error: 'PHP site not found' })

    const parsed = z.object({ dbname: z.string().regex(/^[a-z][a-z0-9_]{0,38}$/).optional() }).safeParse(req.body ?? {})
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid database name' })

    const args = ['panel-install-wordpress', site.domain]
    if (parsed.data.dbname) args.push(parsed.data.dbname)

    const res = await sudo(args, { timeoutMs: 120_000 })
    if (res.code !== 0) {
      audit('site.wordpress.failed', { domain: site.domain, error: helperError(res) })
      return reply.code(500).send({ error: helperError(res) })
    }

    // Parse credentials from helper output (WP_DB_NAME: xxx, etc.)
    const creds: Record<string, string> = {}
    for (const line of res.stdout.trim().split('\n')) {
      const m = line.match(/^WP_(\w+): (.+)$/)
      if (m) creds[m[1]] = m[2]
    }

    // Register the database in panel.db so it shows in Database page
    if (creds.DB_NAME && creds.DB_USER && creds.DB_PASS) {
      db.prepare('INSERT OR IGNORE INTO databases (site_id, name, db_user, db_pass) VALUES (?, ?, ?, ?)')
        .run(site.id, creds.DB_NAME, creds.DB_USER, creds.DB_PASS)
    }

    audit('site.wordpress', { domain: site.domain, db: creds.DB_NAME })
    return {
      ok: true,
      installUrl: creds.URL,
      credentials: {
        dbName: creds.DB_NAME,
        dbUser: creds.DB_USER,
        dbPass: creds.DB_PASS,
        dbHost: creds.DB_HOST || 'localhost',
      },
    }
  })

  // ---- SSL & hapus ----

  app.post('/api/sites/:id/ssl', { preHandler: [requireAuth] }, async (req, reply) => {
    const site = getSite(Number((req.params as { id: string }).id))
    if (!site) return reply.code(404).send({ error: 'Site not found' })

    const issue = await sudo(['panel-issue-ssl', site.domain])
    if (issue.code !== 0) {
      audit('site.ssl.failed', { domain: site.domain, error: helperError(issue) })
      return reply.code(500).send({ error: helperError(issue) })
    }

    const reprovision = await sudo([
      'panel-provision-site',
      site.domain,
      site.type,
      site.type === 'php' ? site.php_version! : String(site.node_port),
      ...(site.type === 'php' && site.web_server === 'apache' ? ['--apache'] : []),
      '--ssl',
    ])
    if (reprovision.code !== 0) {
      audit('site.ssl.reprovision-failed', { domain: site.domain, error: helperError(reprovision) })
      return reply.code(500).send({ error: helperError(reprovision) })
    }

    db.prepare('UPDATE sites SET ssl_enabled = 1 WHERE id = ?').run(site.id)
    audit('site.ssl', { domain: site.domain })
    return { ok: true }
  })

  app.delete('/api/sites/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const site = getSite(Number((req.params as { id: string }).id))
    if (!site) return reply.code(404).send({ error: 'Site not found' })
    const purge = (req.query as { purge?: string }).purge === '1'

    // siteId diteruskan supaya helper menghentikan unit app-<id> untuk situs node
    const res = await sudo([
      'panel-remove-site',
      site.domain,
      ...(purge ? ['--purge'] : []),
      String(site.id),
    ])
    if (res.code !== 0) {
      audit('site.delete.failed', { domain: site.domain, error: helperError(res) })
      return reply.code(500).send({ error: helperError(res) })
    }
    db.prepare('DELETE FROM sites WHERE id = ?').run(site.id)
    audit('site.delete', { domain: site.domain, purge })
    return { ok: true }
  })
}
