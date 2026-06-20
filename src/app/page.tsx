import Link from 'next/link'
import { randomUUID } from 'crypto'

export default function Home() {
  const demoId = randomUUID()

  return (
    <main style={{ maxWidth: 640, margin: '80px auto', padding: '0 24px' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>🪶 Huginn</h1>
      <p style={{ color: '#888', fontSize: 16, marginBottom: 40, lineHeight: 1.6 }}>
        AI-powered support chat with human escalation via Telegram.<br />
        Claude handles first-line support. You handle escalations from your phone.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>How it works</h2>
      <ol style={{ color: '#aaa', lineHeight: 2, paddingLeft: 20 }}>
        <li>Customer sends a support message in your chat widget</li>
        <li>Claude answers with product context and optional tool actions</li>
        <li>If Claude can&apos;t resolve it, it escalates — you get a Telegram notification with the full context</li>
        <li>You reply directly from Telegram — the customer sees it in real-time</li>
        <li>Send <code style={{ background: '#1a1a1a', padding: '1px 6px', borderRadius: 4 }}>/done</code> to hand back to AI</li>
      </ol>

      <div style={{ marginTop: 48, display: 'flex', gap: 12 }}>
        <Link
          href={`/chat/${demoId}`}
          style={{
            background: '#2563eb',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: 8,
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Try the demo →
        </Link>
        <a
          href="https://github.com/jarnhaus/huginn"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: '#1a1a1a',
            color: '#aaa',
            padding: '10px 20px',
            borderRadius: 8,
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          GitHub
        </a>
      </div>

      <div style={{ marginTop: 64, borderTop: '1px solid #1f1f1f', paddingTop: 32, color: '#444', fontSize: 13 }}>
        Built by <a href="https://jarnhaus.dev" style={{ color: '#555' }}>Jarnhaus</a> · Open source · MIT
      </div>
    </main>
  )
}
