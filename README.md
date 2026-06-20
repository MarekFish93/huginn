# 🪶 Huginn

> AI-powered support chat with human escalation via Telegram.  
> Claude handles first-line support. You handle escalations from your phone.

**No Intercom. No Crisp. No $50/mo.** Just Claude + a Telegram bot you already have.

---

## How it works

```
Customer types → Claude answers with context + tools
                        │
              Can't resolve? ─→ Escalation via Telegram
                                        │
                              You reply on your phone
                                        │
                              Customer sees it in real-time (SSE)
                                        │
                              Send /done → AI takes over again
```

## Features

- **AI first-line support** — Claude answers with live context you inject (user info, product state, etc.)
- **Custom tools** — give Claude actions it can take (create ticket, trigger retry, etc.)
- **Telegram escalation** — when AI can't resolve it, you get a Telegram notification with the last 5 turns of context
- **Bidirectional bridge** — reply from Telegram, customer sees it instantly via SSE
- **`/done` handoff** — one command returns the session back to AI
- **Zero vendor lock-in** — your Postgres, your Redis, your bot

## Stack

- [Next.js 15](https://nextjs.org/) (App Router)
- [Claude](https://anthropic.com/) (Anthropic SDK — `claude-sonnet-4-6` by default)
- [Drizzle ORM](https://orm.drizzle.team/) + PostgreSQL
- [ioredis](https://github.com/redis/ioredis) for the Telegram → SSE bridge
- [Telegram Bot API](https://core.telegram.org/bots/api)

## Setup

### 1. Clone and install

```bash
git clone https://github.com/jarnhaus/huginn.git
cd huginn
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Any Postgres — Supabase, Neon, Railway, or self-hosted |
| `REDIS_URL` | Any Redis — Upstash, Railway, or self-hosted |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `TELEGRAM_BOT_TOKEN` | Create a bot via [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | Your chat ID — get it from [@userinfobot](https://t.me/userinfobot) |
| `TELEGRAM_WEBHOOK_SECRET` | Random string — `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | Your deployment URL (no trailing slash) |

### 3. Run migrations

```bash
npm run db:generate
npm run db:migrate
```

### 4. Register the Telegram webhook

```bash
npm run webhook:register
```

This tells Telegram where to send incoming messages. Run once after each domain change.

### 5. Start

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and try the demo.

---

## Customisation

### Adapt the system prompt

Edit `src/lib/chat/system-prompt.ts`. The `context` object is whatever you pass from your frontend — user info, subscription state, product context, anything.

```ts
// In your frontend:
<ChatWidget
  sessionId={sessionId}
  userName={user.name}
  context={{
    productName: 'Acme SaaS',
    planName: user.plan,
    accountAge: user.createdAt,
  }}
/>
```

### Add your own tools

Edit `src/lib/chat/tools.ts`. Two parts:

1. Add a tool definition to `SUPPORT_TOOLS` (this is what Claude sees)
2. Add a handler to `executeTool()` (this is what runs when Claude calls it)

```ts
// Example: let Claude check order status
export const SUPPORT_TOOLS: Tool[] = [
  {
    name: 'getOrderStatus',
    description: 'Look up the status of a customer order.',
    input_schema: {
      type: 'object',
      properties: { orderId: { type: 'string' } },
      required: ['orderId'],
    },
  },
]

export async function executeTool(name: string, input: Record<string, unknown>, ctx: ToolContext) {
  if (name === 'getOrderStatus') {
    const order = await db.query.orders.findFirst({ where: eq(orders.id, input.orderId as string) })
    return order ? `Order status: ${order.status}` : 'Order not found.'
  }
}
```

### Embed in your existing app

You don't need to use the demo UI. The only required pieces are:

- `src/lib/escalation.ts` — Telegram send + sentinel detection
- `src/lib/chat/system-prompt.ts` — system prompt builder
- `src/lib/chat/tools.ts` — tool definitions + executor
- `src/app/api/chat/[id]/route.ts` — POST (AI loop) + GET (SSE)
- `src/app/api/webhooks/telegram/route.ts` — Telegram webhook

Copy these into your Next.js app, set the env vars, run the migration, register the webhook, done.

---

## Deploying

Works on any Node.js host. Redis must be reachable from your server (SSE requires a persistent connection — Vercel Edge is not supported).

**Recommended hosts:** Railway, Render, Fly.io, or a VPS.

---

## FAQ

**Do I need Claude specifically?**  
The escalation pattern is model-agnostic. Swap `claude-sonnet-4-6` for any model you prefer in `src/app/api/chat/[id]/route.ts`.

**Can I use a group chat instead of a personal Telegram chat?**  
Yes — set `TELEGRAM_CHAT_ID` to a group ID. The bot must be a member with message permissions.

**What if Telegram is down?**  
Escalation fails gracefully — the customer is told the team will follow up. The session is not marked as escalated so AI continues to handle it.

**Is this production-ready?**  
The core pattern is battle-tested. What you need to add for production: authentication on the chat route, rate limiting, and error monitoring.

---

## License

MIT — use it, fork it, build on it.

Built by [Jarnhaus](https://jarnhaus.dev).
