import { ChatWidget } from '@/components/ChatWidget'

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <ChatWidget
      sessionId={id}
      // Pass any context you want available in the system prompt:
      // userName="Jane Doe"
      // context={{ productName: 'Acme SaaS', planName: 'Pro', ... }}
    />
  )
}
