'use client'

import { useState, useEffect, useRef } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  pending?: boolean
}

interface ChatWidgetProps {
  sessionId: string
  userName?: string
  context?: Record<string, unknown>
}

export function ChatWidget({ sessionId, userName = 'You', context = {} }: ChatWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [escalated, setEscalated] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // SSE: listen for Telegram replies arriving in real-time.
  useEffect(() => {
    const es = new EventSource(`/api/chat/${sessionId}`)
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { type: string; content?: string; success?: boolean }
        if (data.type === 'telegram_reply' && data.content) {
          setMessages(prev => [...prev, { role: 'assistant', content: data.content! }])
          if (data.content.includes('AI assistant is back')) setEscalated(false)
        }
      } catch { /* ignore malformed events */ }
    }
    return () => es.close()
  }, [sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!input.trim() || loading) return
    const text = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setLoading(true)

    const assistantIdx = messages.length + 1
    setMessages(prev => [...prev, { role: 'assistant', content: '', pending: true }])

    try {
      const res = await fetch(`/api/chat/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, userName, context }),
      })

      if (!res.ok || !res.body) {
        setMessages(prev => prev.map((m, i) =>
          i === assistantIdx ? { ...m, content: 'Something went wrong. Please try again.', pending: false } : m,
        ))
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line) as {
              type: string
              delta?: { type: string; text?: string }
              message?: { content?: Array<{ type: string; text?: string }> }
              content?: string
            }
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              accumulated += event.delta.text ?? ''
              setMessages(prev => prev.map((m, i) =>
                i === assistantIdx ? { ...m, content: accumulated, pending: true } : m,
              ))
            }
            if (event.type === 'telegram_delivery') {
              setEscalated(true)
            }
          } catch { /* partial JSON or ping */ }
        }
      }

      setMessages(prev => prev.map((m, i) =>
        i === assistantIdx ? { ...m, pending: false } : m,
      ))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: 640, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #1f1f1f', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>🪶</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Support</div>
          {escalated && (
            <div style={{ fontSize: 12, color: '#f59e0b' }}>Founder notified — reply incoming</div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 0' }}>
        {messages.length === 0 && (
          <div style={{ color: '#555', textAlign: 'center', marginTop: 60 }}>
            Ask us anything — we&apos;re here to help.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 16, display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '75%',
              padding: '10px 14px',
              borderRadius: 12,
              background: m.role === 'user' ? '#2563eb' : '#1a1a1a',
              color: m.role === 'user' ? '#fff' : '#e5e5e5',
              fontSize: 14,
              lineHeight: 1.5,
              opacity: m.pending ? 0.7 : 1,
            }}>
              {m.content || (m.pending ? '…' : '')}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: 16, borderTop: '1px solid #1f1f1f', display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Type a message…"
          disabled={loading}
          style={{
            flex: 1,
            background: '#1a1a1a',
            border: '1px solid #2a2a2a',
            borderRadius: 8,
            padding: '10px 14px',
            color: '#e5e5e5',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '10px 18px',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
