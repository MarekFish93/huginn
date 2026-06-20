import { db } from '@/lib/db'
import { chatSessions, chatTurns } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { createRedisClient } from '@/lib/redis'
import { detectEscalation, sendTelegramEscalation } from '@/lib/escalation'
import { buildSystemPrompt } from '@/lib/chat/system-prompt'
import { SUPPORT_TOOLS, executeTool } from '@/lib/chat/tools'
import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam, ToolUseBlock, ContentBlock } from '@anthropic-ai/sdk/resources/messages'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'

// ─── POST — customer sends a message ─────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: sessionId } = await params

  if (!sessionId || sessionId.length > 128) {
    return new Response('Invalid session ID', { status: 400 })
  }

  let body: { message?: string; userName?: string; context?: Record<string, unknown> }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const message = body?.message?.trim()
  if (!message || message.length > 4096) {
    return new Response('Invalid message', { status: 400 })
  }

  const userName = body.userName?.trim() || 'Customer'
  const context = body.context ?? {}

  // Upsert the session (creates it on first message).
  await db
    .insert(chatSessions)
    .values({ id: sessionId, context })
    .onConflictDoNothing({ target: chatSessions.id })

  const session = await db.query.chatSessions.findFirst({
    where: eq(chatSessions.id, sessionId),
  })

  // ── Escalated path: bypass AI, forward directly to Telegram ─────────────
  if (session?.escalatedAt) {
    await db.insert(chatTurns).values({
      id: randomUUID(),
      sessionId,
      role: 'user',
      content: message,
    })

    const token = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID
    if (token && chatId) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `💬 [${userName}]: ${message}`,
          ...(session.telegramMessageId
            ? { reply_to_message_id: session.telegramMessageId }
            : {}),
        }),
      })
        .then(async r => {
          if (r.ok) {
            const d = (await r.json()) as { ok: boolean; result?: { message_id: number } }
            if (d.ok && d.result?.message_id) {
              await db
                .update(chatSessions)
                .set({ telegramMessageId: d.result.message_id })
                .where(eq(chatSessions.id, sessionId))
            }
          }
        })
        .catch(() => {})
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const text = token && chatId
          ? 'Your message has been forwarded to the team.'
          : "I've noted your message. The team will follow up shortly."
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } }) + '\n'),
        )
        controller.close()
      },
    })
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } })
  }

  // ── AI path ──────────────────────────────────────────────────────────────
  const turns = await db.query.chatTurns.findMany({
    where: eq(chatTurns.sessionId, sessionId),
    orderBy: [asc(chatTurns.createdAt)],
  })

  await db.insert(chatTurns).values({
    id: randomUUID(),
    sessionId,
    role: 'user',
    content: message,
  })

  const history: MessageParam[] = [
    ...turns.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
    { role: 'user', content: message },
  ]
  const firstUserIdx = history.findIndex(t => t.role === 'user')
  const claudeHistory: MessageParam[] = firstUserIdx > 0 ? history.slice(firstUserIdx) : history

  const client = new Anthropic()
  const streamParams = {
    model: 'claude-sonnet-4-6' as const,
    max_tokens: 1024,
    system: buildSystemPrompt({ ...context, userName }),
    tools: SUPPORT_TOOLS,
    tool_choice: { type: 'auto' as const },
  }

  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  let chain = Promise.resolve()
  const enqueue = (data: object) => {
    chain = chain
      .then(() => writer.write(encoder.encode(JSON.stringify(data) + '\n')))
      .catch(() => {})
  }
  const closeWriter = () => {
    chain = chain.then(() => writer.close()).catch(() => {})
  }

  ;(async () => {
    try {
      const firstStream = client.messages.stream({ ...streamParams, messages: claudeHistory })
      firstStream.on('streamEvent', (e: object) => enqueue(e))
      firstStream.on('error', () => {
        enqueue({ type: 'client_error', message: 'The AI is temporarily unavailable. Please try again.' })
      })

      const firstMsg = await firstStream.finalMessage()

      // No tool call — done.
      if (firstMsg.stop_reason !== 'tool_use') {
        const text = firstMsg.content
          .filter((b: ContentBlock): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
          .map((b: Extract<ContentBlock, { type: 'text' }>) => b.text)
          .join('')
        await persistAndMaybeEscalate({ sessionId, userName, priorTurns: turns, userMessage: message, rawText: text, enqueue })
        return
      }

      // Tool call path.
      const toolBlocks = firstMsg.content.filter(
        (b: ContentBlock): b is ToolUseBlock => b.type === 'tool_use',
      )
      enqueue({ type: 'tool_calls', tools: toolBlocks.map((b: ToolUseBlock) => ({ name: b.name, input: b.input })) })

      const toolResults = await Promise.all(
        toolBlocks.map(async (block: ToolUseBlock) => {
          try {
            const result = await executeTool(block.name, block.input as Record<string, unknown>, { sessionId })
            return { type: 'tool_result' as const, tool_use_id: block.id, content: result }
          } catch (err) {
            return {
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: err instanceof Error ? err.message : 'Tool failed',
              is_error: true,
            }
          }
        }),
      )

      const secondHistory: MessageParam[] = [
        ...claudeHistory,
        { role: 'assistant', content: firstMsg.content },
        { role: 'user', content: toolResults },
      ]
      const secondStream = client.messages.stream({ ...streamParams, messages: secondHistory })
      secondStream.on('streamEvent', (e: object) => enqueue(e))
      const secondMsg = await secondStream.finalMessage()

      const secondText = secondMsg.content
        .filter((b: ContentBlock): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
        .map((b: Extract<ContentBlock, { type: 'text' }>) => b.text)
        .join('')
      await persistAndMaybeEscalate({ sessionId, userName, priorTurns: turns, userMessage: message, rawText: secondText, enqueue })
    } catch (err) {
      console.error('[tg-desk] agentic loop error', err)
      enqueue({ type: 'client_error', message: 'Something went wrong. Please try again.' })
    } finally {
      closeWriter()
    }
  })()

  return new Response(readable, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

// ─── GET — SSE stream for Telegram → browser real-time delivery ──────────────

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: sessionId } = await params

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const redis = createRedisClient()
      redis.on('error', () => {})

      redis.subscribe(`chat:${sessionId}`).catch(() => {
        try { controller.close() } catch { /* already closed */ }
        redis.quit().catch(() => {})
      })

      redis.on('message', (_chan: string, payload: string) => {
        try { controller.enqueue(encoder.encode(`data: ${payload}\n\n`)) } catch { /* closed */ }
      })

      const keepalive = setInterval(() => {
        try { controller.enqueue(encoder.encode(': ping\n\n')) } catch { clearInterval(keepalive) }
      }, 15000)

      req.signal.addEventListener('abort', () => {
        clearInterval(keepalive)
        redis.unsubscribe().catch(() => {})
        redis.quit().catch(() => {})
        try { controller.close() } catch { /* already closed */ }
      }, { once: true })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface PersistArgs {
  sessionId: string
  userName: string
  priorTurns: Array<{ role: string; content: string }>
  userMessage: string
  rawText: string
  enqueue: (data: object) => void
}

async function persistAndMaybeEscalate(args: PersistArgs): Promise<void> {
  const { shouldEscalate, cleanText } = detectEscalation(args.rawText)

  if (shouldEscalate) {
    const result = await sendTelegramEscalation({
      sessionId: args.sessionId,
      userName: args.userName,
      recentTurns: [
        ...args.priorTurns.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
        { role: 'user', content: args.userMessage },
        { role: 'assistant', content: cleanText },
      ],
    })
    if (result.success && result.telegramMessageId) {
      await db
        .update(chatSessions)
        .set({ escalatedAt: new Date(), telegramMessageId: result.telegramMessageId })
        .where(eq(chatSessions.id, args.sessionId))
    }
    args.enqueue({ type: 'telegram_delivery', success: result.success })
  }

  await db.insert(chatTurns).values({
    id: randomUUID(),
    sessionId: args.sessionId,
    role: 'assistant',
    content: cleanText,
  })
}
