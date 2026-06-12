// Shared parsing for Gemma's streamed output. Both the in-browser WebGPU host
// and the remote (LM Studio) host emit the same special-token protocol, so the
// logic that splits thinking blocks, tool-call blocks, and user-facing text
// lives here in one place.

const SPECIAL_TOKENS = new Set([
  '<eos>', '<bos>', '<end_of_turn>', '<start_of_turn>',
  '<|turn>', '<turn|>',
  '<|tool>', '<tool|>',
  '<|tool_call>', '<tool_call|>',
  '<|tool_response>', '<tool_response|>',
  '<|channel>', '<channel|>',
  '<|think|>', '<|image|>',
  '<|"|>',
])

export function stripSpecialTokens(text: string): string {
  let result = text
  for (const token of SPECIAL_TOKENS) {
    if (result.includes(token)) {
      result = result.split(token).join('')
    }
  }
  return result
}

export interface StreamFilterCallbacks {
  onChunk?: (text: string) => void
  onThinkingChunk?: (text: string) => void
}

/**
 * Stateful filter for a stream of model text. Feed it chunks via push(); it
 * forwards clean visible text to onChunk and reasoning text to onThinkingChunk,
 * while accumulating the full raw output (special tokens intact) for the agent
 * to parse tool calls from.
 */
export class GemmaStreamFilter {
  private raw = ''
  private insideThinking = false
  private insideToolCall = false

  constructor(private cb: StreamFilterCallbacks = {}) {}

  push(text: string): void {
    this.raw += text

    // Track thinking blocks
    if (text.includes('<|channel>')) {
      this.insideThinking = true
      return
    }
    if (text.includes('<channel|>')) {
      this.insideThinking = false
      return
    }
    if (this.insideThinking) {
      const clean = text.replace(/^thought\n?/, '')
      if (clean) this.cb.onThinkingChunk?.(clean)
      return
    }

    // Track tool call blocks
    if (text.includes('<|tool_call>')) this.insideToolCall = true
    if (text.includes('<tool_call|>') || text.includes('<tool_response|>')) {
      this.insideToolCall = false
      return
    }
    if (this.insideToolCall || text.includes('<|tool_response>')) return

    const clean = stripSpecialTokens(text)
    if (clean) this.cb.onChunk?.(clean)
  }

  get result(): string {
    return this.raw
  }
}
