import { config } from 'dotenv'

config({ path: '.env.local' })

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET

  if (!token) { console.error('Missing TELEGRAM_BOT_TOKEN'); process.exit(1) }
  if (!baseUrl) { console.error('Missing NEXT_PUBLIC_APP_URL'); process.exit(1) }
  if (!secret) { console.error('Missing TELEGRAM_WEBHOOK_SECRET'); process.exit(1) }

  const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/webhooks/telegram`
  console.log(`Registering webhook: ${webhookUrl}`)

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl, secret_token: secret, allowed_updates: ['message'] }),
  })

  const data = await res.json()
  console.log(JSON.stringify(data, null, 2))

  if (!res.ok || !(data as { ok: boolean }).ok) {
    console.error('Webhook registration failed.')
    process.exit(1)
  }
  console.log('Done.')
}

main().catch(err => { console.error(err); process.exit(1) })
