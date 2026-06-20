import { db } from '@/lib/db'
import { chatSessions, chatTurns } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createRedisClient } from '@/lib/redis'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'

interface TelegramUpdate {
  update_id?: number
  message?: {
    message_id: number
    from?: { id: number }
    text?: string
    reply_to_message?: { message_id: number }
  }
}

export async function POST(req: Request): Promise<Response> {
  // Validate the secret before doing any work.
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  const providedSecret = req.headers.get('x-telegram-bot-api-secret-token')
  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return new Response('Forbidden', { status: 403 })
  }

  try {
    const update = (await req.json()) as TelegramUpdate
    const message = update?.message

    // Only process replies — a plain message cannot be safely routed.
    if (!message?.text || !message?.reply_to_message) return new Response('OK')

    if (message.text.length > 4096) return new Response('OK')

    // Find the session by the Telegram message_id we last stored.
    const session = await db.query.chatSessions.findFirst({
      where: eq(chatSessions.telegramMessageId, message.reply_to_message.message_id),
    })
    if (!session) return new Response('OK')

    // /done — close escalation and return customer to AI.
    if (message.text.trim().toLowerCase() === '/done') {
      await db
        .update(chatSessions)
        .set({ escalatedAt: null, telegramMessageId: null })
        .where(eq(chatSessions.id, session.id))

      const closeText = 'The team has resolved this conversation. Feel free to keep chatting — the AI assistant is back.'
      await db.insert(chatTurns).values({
        id: randomUUID(),
        sessionId: session.id,
        role: 'assistant',
        content: closeText,
      })

      const redis = createRedisClient()
      redis.on('error', () => {})
      try {
        await redis.publish(`chat:${session.id}`, JSON.stringify({ type: 'telegram_reply', content: closeText }))
      } finally {
        await redis.quit().catch(() => {})
      }
      return new Response('OK')
    }

    // Forward founder's reply verbatim as an assistant turn.
    await db.insert(chatTurns).values({
      id: randomUUID(),
      sessionId: session.id,
      role: 'assistant',
      content: message.text,
      telegramMessageId: message.message_id,
    })

    // Keep telegramMessageId updated so replying to any message in the thread still works.
    await db
      .update(chatSessions)
      .set({ telegramMessageId: message.message_id })
      .where(eq(chatSessions.id, session.id))

    // Push to the SSE stream via Redis pub/sub.
    const redis = createRedisClient()
    redis.on('error', () => {})
    try {
      await redis.publish(`chat:${session.id}`, JSON.stringify({ type: 'telegram_reply', content: message.text }))
    } finally {
      await redis.quit().catch(() => {})
    }

    return new Response('OK')
  } catch (err) {
    // Never return non-2xx — Telegram retries for ~48 hours on errors.
    console.error('[tg-desk] telegram webhook error', err)
    return new Response('OK')
  }
}
