import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import { CONFIG } from './config'
import { authRoutes } from './auth'
import { sitesRoutes } from './sites'
import { systemRoutes } from './system'
import { databasesRoutes } from './databases'
import { backupsRoutes } from './backups'
import { filesRoutes } from './files'
import { mailRoutes } from './mail'
import { hostRoutes } from './host'
import { notificationsRoutes } from './notify'
import { setupTerminal } from './terminal'

async function main(): Promise<void> {
  // Large bodyLimit for SQL imports via the panel (max 64MB)
  const app = Fastify({ logger: false, trustProxy: true, bodyLimit: 64 * 1024 * 1024 })

  // Keep the raw JSON body on the request (webhook HMAC needs the exact bytes)
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    ;(req as unknown as { rawBody?: Buffer }).rawBody = body as Buffer
    try {
      done(null, JSON.parse(body.toString() || '{}'))
    } catch {
      done(new Error('invalid JSON body'), undefined)
    }
  })

  await app.register(fastifyCookie)

  await app.register(authRoutes)
  await app.register(sitesRoutes)
  await app.register(systemRoutes)
  await app.register(databasesRoutes)
  await app.register(backupsRoutes)
  await app.register(filesRoutes)
  await app.register(mailRoutes)
  await app.register(hostRoutes)
  await app.register(notificationsRoutes)

  // Serve frontend (SPA) bila build ada — dev pakai Vite proxy ke sini
  if (existsSync(CONFIG.publicDir)) {
    await app.register(fastifyStatic, { root: CONFIG.publicDir, wildcard: false })
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith('/api/')) {
        return reply.code(404).send({ error: 'endpoint not found' })
      }
      return reply.sendFile('index.html')
    })
  }

  app.get('/api/health', async () => ({ ok: true }))

  await app.listen({ host: CONFIG.host, port: CONFIG.port })
  console.log(`[panel] backend aktif di ${CONFIG.host}:${CONFIG.port} (db: ${CONFIG.dbPath})`)

  // SSH terminal WebSocket (needs the underlying http server)
  setupTerminal(app, app.server)
}

main().catch((err) => {
  console.error('[panel] failed to start:', err)
  process.exit(1)
})
