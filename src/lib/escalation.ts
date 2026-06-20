// The sentinel Claude emits when it decides to escalate.
// Must match the string in the system prompt exactly.
export const ESCALATION_SENTINEL = '__ESCALATE__'

export function detectEscalation(text: string): { shouldEscalate: boolean; cleanText: string } {
  const lines = text.split('\n')
  const idx = lines.findIndex(l => l.trim() === ESCALATION_SENTINEL)
  if (idx === -1) return { shouldEscalate: false, cleanText: text }
  return {
    shouldEscalate: true,
    cleanText: lines.filter((_, i) => i !== idx).join('\n').trim(),
  }
}

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface TelegramEscalationArgs {
  sessionId: string
  userName: string
  recentTurns: ConversationTurn[]
}

export interface TelegramEscalationResult {
  success: boolean
  telegramMessageId?: number
  error?: string
}

export async function sendTelegramEscalation(
  args: TelegramEscalationArgs,
): Promise<TelegramEscalationResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    console.warn('[tg-desk] Telegram not configured — skipping escalation')
    return { success: false, error: 'Telegram not configured' }
  }

  const last5 = args.recentTurns.slice(-5)
  const transcript = last5
    .map(t => `${t.role === 'user' ? args.userName : 'AI'}: ${t.content}`)
    .join('\n\n')

  const text =
    `🆘 Support escalation\n` +
    `User: ${args.userName}\n` +
    `Session: ${args.sessionId}\n\n` +
    `${transcript}\n\n` +
    `Reply to this message to respond. Send /done when resolved.`

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
    const data = (await res.json()) as {
      ok: boolean
      result?: { message_id: number }
      description?: string
    }
    if (!data.ok) return { success: false, error: data.description ?? 'Telegram API error' }
    return { success: true, telegramMessageId: data.result?.message_id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}
