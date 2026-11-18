import type { FastifyReply, FastifyRequest } from 'fastify'
import { SignJWT, jwtVerify } from 'jose'
import crypto from 'node:crypto'
import { z } from 'zod'
import { audit, db, jwtSecret } from './db'
import { generateTotpSecret, otpauthUrl, verifyTotp } from './totp'

const COOKIE_NAME = 'panel_session'
const SESSION_HOURS = 12

// ---------- Password (scrypt bawaan Node — tanpa module native) ----------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return crypto.timingSafeEqual(expected, actual)
}

// ---------- Guard ----------

export interface AuthedRequest extends FastifyRequest {
  user?: { id: string; username: string }
}

export async function requireAuth(req: AuthedRequest, reply: FastifyReply): Promise<void> {
  const token = req.cookies[COOKIE_NAME]
  if (!token) return void reply.code(401).send({ error: 'Not signed in' })
  try {
    const { payload: claims } = await jwtVerify(token, jwtSecret())
    req.user = { id: String(claims.sub), username: String(claims.username ?? '') }
  } catch {
    return void reply.code(401).send({ error: 'Session expired, sign in again' })
  }
}

// ---------- Rate limit login sederhana (in-memory, per IP) ----------

const attempts = new Map<string, { n: number; resetAt: number }>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 60_000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { n: 1, resetAt: now + WINDOW_MS })
    return true
  }
  entry.n += 1
  return entry.n <= MAX_ATTEMPTS
}

// ---------- Routes ----------

const Credentials = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/, 'username may only contain letters, digits, . _ -'),
  password: z.string().min(10).max(200),
})

export function userCount(): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c
}

async function issueSession(reply: FastifyReply, userId: number, username: string): Promise<void> {
  const token = await new SignJWT({ username })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .setProtectedHeader({ alg: 'HS256' })
    .sign(jwtSecret())
  reply.setCookie(COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_HOURS * 3600,
  })
}

export async function authRoutes(app: import('fastify').FastifyInstance): Promise<void> {
  app.get('/api/auth/status', async () => ({
    setupRequired: userCount() === 0,
    authenticated: false,
  }))

  // Hanya berlaku saat belum ada admin sama sekali (first run)
  app.post('/api/auth/setup', async (req, reply) => {
    if (userCount() > 0) return reply.code(409).send({ error: 'Admin already exists — just sign in' })
    const parsed = Credentials.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid input' })
    }
    const info = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(
      parsed.data.username,
      hashPassword(parsed.data.password),
    )
    audit('auth.setup', { username: parsed.data.username })
    await issueSession(reply, Number(info.lastInsertRowid), parsed.data.username)
    return { ok: true }
  })

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = Credentials.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid username or password' })
    }
    if (!checkRateLimit(req.ip ?? '?')) {
      return reply.code(429).send({ error: 'Too many attempts — wait 1 minute' })
    }
    const user = db
      .prepare('SELECT id, username, password_hash, totp_secret, totp_enabled FROM users WHERE username = ?')
      .get(parsed.data.username) as
      | { id: number; username: string; password_hash: string; totp_secret: string | null; totp_enabled: number }
      | undefined
    if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
      audit('auth.login.failed', { ip: req.ip, username: parsed.data.username })
      return reply.code(401).send({ error: 'Invalid username or password' })
    }
    // Second factor when TOTP is enabled
    if (user.totp_enabled === 1 && user.totp_secret) {
      const code = String((req.body as { totp?: string })?.totp ?? '')
      if (!code) {
        return reply.code(401).send({ error: 'TOTP code required', totpRequired: true })
      }
      if (!verifyTotp(user.totp_secret, code)) {
        audit('auth.login.totp.failed', { ip: req.ip, username: user.username })
        return reply.code(401).send({ error: 'Invalid TOTP code', totpRequired: true })
      }
    }
    audit('auth.login', { username: user.username, ip: req.ip })
    await issueSession(reply, user.id, user.username)
    return { ok: true }
  })

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' })
    return { ok: true }
  })

  // ---- TOTP 2FA management (signed in) ----

  app.get('/api/auth/totp', { preHandler: [requireAuth] }, async (req) => {
    const row = db
      .prepare('SELECT username, totp_enabled, totp_secret FROM users WHERE id = ?')
      .get(Number((req as AuthedRequest).user?.id)) as
      | { username: string; totp_enabled: number; totp_secret: string | null }
      | undefined
    return {
      enabled: row?.totp_enabled === 1,
      pending: !!row?.totp_secret && row.totp_enabled !== 1,
    }
  })

  // Generate a new secret (stored but NOT active until confirmed with a code)
  app.post('/api/auth/totp/setup', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as AuthedRequest).user!
    const current = db
      .prepare('SELECT totp_enabled FROM users WHERE id = ?')
      .get(Number(user.id)) as { totp_enabled: number } | undefined
    if (current?.totp_enabled === 1) {
      return reply.code(409).send({ error: 'TOTP is already enabled — disable it first' })
    }
    const secret = generateTotpSecret()
    db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, Number(user.id))
    return { secret, otpauth: otpauthUrl(secret, user.username) }
  })

  app.post('/api/auth/totp/enable', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as AuthedRequest).user!
    const code = String((req.body as { code?: string })?.code ?? '')
    const row = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(Number(user.id)) as { totp_secret: string | null }
    if (!row.totp_secret) return reply.code(400).send({ error: 'Run setup first' })
    if (!verifyTotp(row.totp_secret, code)) {
      return reply.code(400).send({ error: 'Invalid code — check your authenticator app and try again' })
    }
    db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(Number(user.id))
    audit('auth.totp.enabled', { username: user.username })
    return { ok: true }
  })

  app.post('/api/auth/totp/disable', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as AuthedRequest).user!
    const parsed = z.object({ password: z.string().min(1) }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Password is required' })
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(Number(user.id)) as { password_hash: string }
    if (!verifyPassword(parsed.data.password, row.password_hash)) {
      return reply.code(401).send({ error: 'Wrong password' })
    }
    db.prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?').run(Number(user.id))
    audit('auth.totp.disabled', { username: user.username })
    return { ok: true }
  })

  app.post('/api/auth/password', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as AuthedRequest).user!
    const parsed = z
      .object({
        current: z.string().min(1),
        next: z.string().min(10, 'New password must be at least 10 characters').max(200),
      })
      .safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid input' })
    }
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(Number(user.id)) as { password_hash: string }
    if (!verifyPassword(parsed.data.current, row.password_hash)) {
      return reply.code(401).send({ error: 'Current password is wrong' })
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(parsed.data.next), Number(user.id))
    audit('auth.password.changed', { username: user.username })
    return { ok: true }
  })
}
