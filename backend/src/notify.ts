import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { audit, getMeta, setMeta } from './db'
import { requireAuth } from './auth'

/**
 * Telegram notifications — fire-and-forget; a notification failure must
 * never break the operation that triggered it. Configure from the
 * Settings page (bot token + chat id from @BotFather / @userinfobot).
 */

async function telegramCall(token: string, chat: string, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string }
    if (!res.ok || data.ok === false) return { ok: false, error: data.description ?? `HTTP ${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network error' }
  }
}

export async function notify(event: string, detail: string): Promise<void> {
  const token = getMeta('notify_tg_token', '')
  const chat = getMeta('notify_tg_chat', '')
  if (!token || !chat) return
  await telegramCall(token, chat, `[panel] ${event}\n${detail}`)
}

export async function notificationsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/notifications', { preHandler: [requireAuth] }, async () => ({
    enabled: !!getMeta('notify_tg_token', '') && !!getMeta('notify_tg_chat', ''),
    chat: getMeta('notify_tg_chat', ''),
    // token is never sent back to the browser — only a masked hint
    tokenHint: getMeta('notify_tg_token', '').replace(/^(.{8}).*(.{4})$/, '$1…$2'),
  }))

  app.put('/api/notifications', { preHandler: [requireAuth] }, async (req, reply) => {
    const Body = z
      .object({
        token: z.string().trim().max(200),
        chat: z.string().trim().max(64),
      })
      .safeParse(req.body)
    if (!Body.success) return reply.code(400).send({ error: 'Invalid input' })
    // empty token = keep the stored one (edit chat only); both empty = disable
    if (Body.data.token) setMeta('notify_tg_token', Body.data.token)
    else if (!Body.data.chat) setMeta('notify_tg_token', '')
    setMeta('notify_tg_chat', Body.data.chat)
    audit('notifications.settings', { chat: Body.data.chat, tokenChanged: !!Body.data.token })
    return { ok: true }
  })

  app.post('/api/notifications/test', { preHandler: [requireAuth] }, async (_req, reply) => {
    const token = getMeta('notify_tg_token', '')
    const chat = getMeta('notify_tg_chat', '')
    if (!token || !chat) return reply.code(400).send({ error: 'Configure the token and chat id first' })
    const result = await telegramCall(token, chat, '[panel] test notification — everything works ✅')
    if (!result.ok) return reply.code(502).send({ error: `Telegram: ${result.error}` })
    return { ok: true }
  })
}
