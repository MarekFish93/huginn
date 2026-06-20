import type { Tool } from '@anthropic-ai/sdk/resources/messages'

// ─── Tool definitions sent to Claude ────────────────────────────────────────
// Replace or extend these with tools that make sense for your product.
// Each tool here must have a matching handler in executeTool() below.

export const SUPPORT_TOOLS: Tool[] = [
  {
    name: 'createTicket',
    description:
      'Create a support ticket for issues that need engineering attention or cannot be resolved in this chat. Only use this when the customer reports a bug or a persistent problem. Before calling, tell the customer you are about to create a ticket and that the team will follow up.',
    input_schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'One-sentence summary of the issue.',
        },
        details: {
          type: 'string',
          description: 'Detailed description including steps to reproduce if applicable.',
        },
        severity: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'How urgently this needs attention.',
        },
      },
      required: ['summary', 'details', 'severity'],
    },
  },
]

// ─── Tool executor ───────────────────────────────────────────────────────────
// Called from the agentic loop after Claude decides to use a tool.
// Returns a string result that gets fed back to Claude.

export interface ToolContext {
  sessionId: string
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  if (name === 'createTicket') {
    // TODO: replace with your actual ticketing system (Linear, GitHub Issues, etc.)
    // For now, we just log it and return a confirmation.
    console.log('[tg-desk] Ticket created', { sessionId: ctx.sessionId, ...input })
    return `Ticket created successfully. The team will follow up as soon as possible.`
  }

  return `Unknown tool: ${name}`
}
