import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Huginn — AI support chat with Telegram escalation',
  description: 'Claude handles first-line support. You handle escalations from your phone.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0f0f0f', color: '#e5e5e5', fontFamily: 'system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
