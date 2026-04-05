export interface ToolParameterDef {
  type: string
  description: string
  enum?: string[]
}

export interface ToolDefinition {
  name: string
  description: string
  parameters?: {
    type: 'object'
    properties: Record<string, ToolParameterDef>
    required?: string[]
  }
}

export interface ToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface ToolResponse {
  name: string
  result: unknown
}

export interface ToolExecutor {
  execute(call: ToolCall): Promise<ToolResponse>
}

export interface GenerateOptions {
  maxTokens?: number
  onChunk?: (text: string) => void
  onThinkingChunk?: (text: string) => void
  imageDataUrl?: string
}

export interface ModelBackend {
  generate(prompt: string, options?: GenerateOptions): Promise<string>
  countTokens(text: string): number
  contextLimit: number
  isLoaded(): boolean
}

export interface ConversationMessage {
  role: 'system' | 'user' | 'model'
  content: string
  toolCalls?: ToolCall[]
  toolResponses?: ToolResponse[]
}

export interface AgentLoopOptions {
  model: ModelBackend
  tools: ToolDefinition[]
  executor: ToolExecutor
  systemPrompt: string
  maxIterations?: number
  enableThinking?: boolean
  onThinking?: (text: string) => void
  onThinkingChunk?: (text: string) => void
  onToolCall?: (call: ToolCall) => void
  onToolResponse?: (resp: ToolResponse) => void
  onChunk?: (text: string) => void
}

export interface AgentRunResult {
  response: string
  toolCallCount: number
  iterations: number
}
