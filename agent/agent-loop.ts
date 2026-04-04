import type {
  AgentLoopOptions,
  AgentRunResult,
  ConversationMessage,
  ToolCall,
  ToolResponse,
} from './types'
import { buildPrompt, appendToolCallAndResponse } from './prompt-builder'
import { parseToolCalls, hasToolCalls, extractThinking, extractFinalResponse } from './tool-parser'
import { log } from '@/shared/logger'

const DEFAULT_MAX_ITERATIONS = 10

export class AgentLoop {
  private options: AgentLoopOptions
  private history: ConversationMessage[] = []

  constructor(options: AgentLoopOptions) {
    this.options = options
  }

  async run(userMessage: string): Promise<AgentRunResult> {
    const { model, tools, executor, systemPrompt, enableThinking = false } = this.options
    const maxIterations = this.options.maxIterations ?? DEFAULT_MAX_ITERATIONS

    this.history.push({ role: 'user', content: userMessage })

    let prompt = buildPrompt(systemPrompt, tools, this.history, enableThinking)
    let iterations = 0
    let toolCallCount = 0
    let pendingImageDataUrl: string | undefined

    while (iterations < maxIterations) {
      iterations++

      log.debug('Agent iteration', iterations, 'prompt length:', prompt.length, 'hasImage:', !!pendingImageDataUrl)
      log.debug('Prompt tail:', prompt.slice(-500))

      const DEFAULT_MAX_TOKENS = 1024
      const MIN_OUTPUT_BUDGET = 256

      let output = await model.generate(prompt, {
        maxTokens: DEFAULT_MAX_TOKENS,
        onChunk: this.options.onChunk,
        imageDataUrl: pendingImageDataUrl,
      })

      // Handle truncated tool calls
      if (output.includes('<|tool_call>') && !output.includes('<tool_call|>')) {
        const fullPrompt = prompt + output
        const promptTokens = model.countTokens(fullPrompt)
        const remaining = model.contextLimit - promptTokens

        if (remaining > MIN_OUTPUT_BUDGET) {
          // Case 2: room left — continue with remaining budget
          log.info('Truncated tool call, continuing with', remaining, 'token budget')
          const continuation = await model.generate(fullPrompt, {
            maxTokens: remaining,
            onChunk: this.options.onChunk,
          })
          output += continuation
        } else {
          // Case 1: context full — strip thinking to free up space, then continue
          log.info('Truncated tool call, context nearly full — stripping thinking and retrying')
          const stripped = output.replace(/<\|channel>thought[\s\S]*?<channel\|>\s*/g, '')
          const strippedPrompt = prompt + stripped
          const strippedTokens = model.countTokens(strippedPrompt)
          const strippedRemaining = model.contextLimit - strippedTokens

          if (strippedRemaining > MIN_OUTPUT_BUDGET) {
            const continuation = await model.generate(strippedPrompt, {
              maxTokens: strippedRemaining,
              onChunk: this.options.onChunk,
            })
            output = stripped + continuation
          } else {
            log.warn('Context exhausted even after stripping thinking — cannot complete tool call')
          }
        }
      }
      pendingImageDataUrl = undefined

      log.debug('Raw model output:', JSON.stringify(output.slice(0, 500)))

      // Extract thinking if present
      const { thinking, rest } = extractThinking(output)
      if (thinking && this.options.onThinking) {
        this.options.onThinking(thinking)
      }

      // Check for tool calls
      if (!hasToolCalls(rest)) {
        // No tool calls - this is the final response
        const response = extractFinalResponse(output)
        this.history.push({ role: 'model', content: response })
        return { response, toolCallCount, iterations }
      }

      // Parse and execute tool calls
      const calls = parseToolCalls(rest)
      const responses: ToolResponse[] = []

      for (const call of calls) {
        if (this.options.onToolCall) {
          this.options.onToolCall(call)
        }

        const response = await executor.execute(call)
        responses.push(response)

        if (this.options.onToolResponse) {
          this.options.onToolResponse(response)
        }
      }

      toolCallCount += calls.length

      // Check if any tool response contains an image (e.g. screenshot)
      for (const resp of responses) {
        const result = resp.result as Record<string, unknown>
        if (result?.screenshot && typeof result.screenshot === 'string') {
          pendingImageDataUrl = result.screenshot as string
          // Replace the raw data URL with a placeholder in the text response
          // (the actual image goes through the multimodal processor)
          resp.result = { screenshot: 'captured' }
        }
      }

      // Record tool interaction in history
      this.history.push({
        role: 'model',
        content: '',
        toolCalls: calls,
        toolResponses: responses,
      })

      // Rebuild prompt with tool results for next iteration
      prompt = appendToolCallAndResponse(prompt, calls, responses)

      if (pendingImageDataUrl) {
        // Close model turn, present image in a user turn (Gemma 4 expects images in user turns)
        prompt += '<turn|>\n<|turn>user\nHere is the screenshot:\n<|image|><turn|>\n<|turn>model'
      }
    }

    // Hit max iterations
    const response = `I've reached the maximum number of tool calls (${maxIterations}). Here's what I found so far based on the tools I've used.`
    this.history.push({ role: 'model', content: response })
    return { response, toolCallCount, iterations }
  }

  updateOptions(partial: Partial<Pick<AgentLoopOptions, 'enableThinking' | 'maxIterations'>>): void {
    if (partial.enableThinking !== undefined) this.options.enableThinking = partial.enableThinking
    if (partial.maxIterations !== undefined) this.options.maxIterations = partial.maxIterations
  }

  clearHistory(): void {
    this.history = []
  }

  getHistory(): ConversationMessage[] {
    return [...this.history]
  }
}
