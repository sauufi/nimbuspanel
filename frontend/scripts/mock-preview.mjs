// mock-preview.mjs — serve frontend/dist with mock API data for local UI preview.
// Usage: node scripts/mock-preview.mjs   (then open http://127.0.0.1:5199)
import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const PORT = Number(process.env.PORT || 5199)
const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

const SITES = [
  { id: 1, domain: 'tokoku.com', type: 'php', php_version: '8.3', node_port: null, ssl_enabled: 1, web_server: 'nginx', repo_url: null, branch: null, node_version: null, build_cmd: null, start_cmd: null, created_at: now },
  { id: 2, domain: 'blog.pribadi.id', type: 'php', php_version: '8.2', node_port: null, ssl_enabled: 1, web_server: 'apache', repo_url: null, branch: null, node_version: null, build_cmd: null, start_cmd: null, created_at: now },
  { id: 3, domain: 'api.bisnis.co', type: 'node', php_version: null, node_port: 31001, ssl_enabled: 0, web_server: 'nginx', repo_url: 'https://github.com/demo/api.git', branch: 'main', node_version: '22', build_cmd: 'npm run build', start_cmd: 'node dist/index.js', created_at: now },
]
const DBS = [
  { id: 1, site_id: 1, name: 'tokoku_wp', db_user: 'u_tokoku_wp', db_pass: 'DemoPass123', created_at: now, sizeMb: 24.6, tables: 38, exists: true },
  { id: 2, site_id: null, name: 'analitik', db_user: 'u_analitik', db_pass: 'DemoPass456', created_at: now, sizeMb: 132.1, tables: 61, exists: true },
]
const STAMP = '20261117'
const BACKUPS = [
  { dir: STAMP + '-023001', file: 'site-tokoku.com.tar.gz', size: 51_400_000 },
  { dir: STAMP + '-023001', file: 'db-tokoku_wp.sql.gz', size: 8_200_000 },
  { dir: STAMP + '-023001', file: 'panel.db', size: 90_000 },
  { dir: '202611' + '16-023001', file: 'site-tokoku.com.tar.gz', size: 49_800_000 },
]
const MAIL = {
  installed: true,
  host: 'mail.tokoku.com',
  domains: ['tokoku.com'],
  mailboxes: [{ address: 'admin@tokoku.com', password: 'DemoMail123' }, { address: 'kasir@tokoku.com', password: 'DemoMail456' }],
  aliases: [{ address: 'info@tokoku.com', target: 'admin@tokoku.com' }],
  phpSites: SITES.filter((s) => s.type === 'php'),
  dkim: ['tokoku.com'],
}
const FS = [
  { type: 'd', size: 4096, mtime: '2026-11-15 09:12', name: 'wp-admin' },
  { type: 'd', size: 4096, mtime: '2026-11-15 09:12', name: 'wp-content' },
  { type: 'f', size: 2412, mtime: '2026-11-15 09:12', name: 'index.php' },
  { type: 'f', size: 19915, mtime: '2026-11-15 09:12', name: 'wp-config.php' },
  { type: 'f', size: 3, mtime: '2026-11-15 09:12', name: '.htaccess' },
]

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }

function json(res, code, data) {
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(JSON.stringify(data))
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const p = url.pathname

  if (p.startsWith('/api/')) {
    const authed = true // preview mode: always "signed in"
    if (p === '/api/auth/status') return json(res, 200, { setupRequired: false, authenticated: authed })
    if (p === '/api/system/metrics')
      return json(res, 200, { mem: { totalMb: 1993, usedMb: 912, usedPct: 46 }, swap: { totalMb: 2048, freeMb: 1990 }, load: [0.42, 0.35, 0.31], cores: 2, uptimeSec: 1_048_570, disk: { totalGb: 47.9, freeGb: 31.2 }, hostname: 'hub-cloud-01' })
    if (p === '/api/system/services')
      return json(res, 200, { services: [
        { unit: 'nginx', active: true }, { unit: 'apache2', active: true }, { unit: 'php8.2-fpm', active: true },
        { unit: 'php8.3-fpm', active: true }, { unit: 'mariadb', active: true }, { unit: 'panel', active: true },
        { unit: 'postfix', active: true }, { unit: 'dovecot', active: false }, { unit: 'app-3', active: true },
      ] })
    if (p === '/api/sites' || p === '/api/sites/options') {
      if (p.endsWith('/options')) return json(res, 200, { phpVersions: ['8.2', '8.3'], nodeVersions: ['22'] })
      return json(res, 200, { sites: SITES })
    }
    const m = p.match(/^\/api\/sites\/(\d+)(.*)$/)
    if (m) {
      const site = SITES.find((s) => s.id === Number(m[1]))
      if (!site) return json(res, 404, { error: 'not found' })
      const rest = m[2]
      if (rest === '' && req.method === 'GET')
        return json(res, 200, {
          site, docroot: `/var/www/${site.domain}/htdocs`, sslDir: `/etc/nginx/ssl/${site.domain}`,
          service: { unit: site.type === 'php' ? `php${site.php_version}-fpm` : 'app-3', active: site.id !== 2 },
          ...(site.type === 'node' ? { node: { unit: 'app-3', currentRelease: '20261117-101530' } } : {}),
        })
      if (rest === '/rules') return json(res, 200, { rules: '# managed by panel — custom nginx rules (empty)\n' })
      if (rest === '/env') return json(res, 200, { env: 'DATABASE_URL=mysql://u_demo:pass@localhost/demo\nAPP_ENV=production\n' })
      if (rest === '/fs' && req.method === 'GET') {
        if (url.searchParams.get('path') === 'wp-content')
          return json(res, 200, { path: 'wp-content', entries: [
            { type: 'd', size: 4096, mtime: '2026-11-15 09:12', name: 'uploads' },
            { type: 'd', size: 4096, mtime: '2026-11-14 21:00', name: 'themes' },
            { type: 'f', size: 32, mtime: '2026-11-14 21:00', name: 'index.php' },
          ] })
        return json(res, 200, { path: '', entries: FS })
      }
      if (rest === '/fs/read') return json(res, 200, { path: 'index.php', content: '<?php\n// demo content for the preview\nrequire __DIR__ . \'/wp-blog-header.php\';\n' })
      return json(res, 200, { ok: true })
    }
    if (p === '/api/db') return json(res, 200, { databases: DBS })
    if (p === '/api/backups') return json(res, 200, { backups: BACKUPS })
    if (p === '/api/backups/settings') return json(res, 200, { enabled: true, time: '02:30', retention: 14, scope: 'all' })
    if (p === '/api/mail') return json(res, 200, MAIL)
    if (p === '/api/mail/dkim-record') return json(res, 200, { record: 'mail._domainkey.tokoku.com. 3600 IN TXT "v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkq..." (demo)' })
    if (p === '/api/panel-host') return json(res, 200, { mode: 'domain', hostname: 'panel.tokoku.com', ssl: 'yes', webmail: true })
    if (p === '/api/notifications') return json(res, 200, { enabled: true, chat: '128459177', tokenHint: '7283911245:AAH…f3d2' })
    if (p === '/api/auth/totp') return json(res, 200, { enabled: false, pending: false })
    if (p === '/api/health') return json(res, 200, { ok: true })
    return json(res, 200, { ok: true })
  }

  // static
  let file = path.join(ROOT, p === '/' ? 'index.html' : p)
  if (!existsSync(file)) file = path.join(ROOT, 'index.html')
  const ext = path.extname(file)
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'content-length': statSync(file).size })
  createReadStream(file).pipe(res)
})

server.listen(PORT, '127.0.0.1', () => console.log(`preview: http://127.0.0.1:${PORT}`))
