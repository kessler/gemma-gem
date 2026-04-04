import type { ToolCall, ToolResponse } from '../agent/types'

// Content Script -> Service Worker
export type ChatSettings = {
  thinking: boolean
  maxIterations: number
}

export type ChatSendMessage = {
  type: 'chat:send'
  text: string
  settings?: ChatSettings
}

export type SettingsUpdateMessage = {
  type: 'settings:update'
  settings: ChatSettings
}

export type ContextClearMessage = {
  type: 'context:clear'
}

export type ChatOpenMessage = {
  type: 'chat:open'
}

export type ToolResultMessage = {
  type: 'tool:result'
  requestId: string
  result: unknown
}

// Service Worker -> Content Script
export type AgentResponseMessage = {
  type: 'agent:response'
  text: string
}

export type AgentChunkMessage = {
  type: 'agent:chunk'
  text: string
}

export type AgentThinkingMessage = {
  type: 'agent:thinking'
  text: string
}

export type AgentToolCallMessage = {
  type: 'agent:tool_call'
  requestId: string
  call: ToolCall
}

export type ModelStatusMessage = {
  type: 'model:status'
  status: 'loading' | 'ready' | 'error'
  progress?: number
  error?: string
}

// Service Worker -> Offscreen Document
export type AgentRunMessage = {
  type: 'agent:run'
  tabId: number
  userMessage: string
  settings?: ChatSettings
}

export type ModelLoadMessage = {
  type: 'model:load'
}

// Offscreen Document -> Service Worker
export type OffscreenToolExecuteMessage = {
  type: 'tool:execute'
  tabId: number
  requestId: string
  call: ToolCall
}

export type OffscreenAgentResponseMessage = {
  type: 'agent:response'
  tabId: number
  text: string
}

export type OffscreenAgentChunkMessage = {
  type: 'agent:chunk'
  tabId: number
  text: string
}

export type OffscreenModelStatusMessage = {
  type: 'model:status'
  status: 'loading' | 'ready' | 'error'
  progress?: number
  error?: string
}

export type Message =
  | ChatSendMessage
  | ChatOpenMessage
  | SettingsUpdateMessage
  | ContextClearMessage
  | ToolResultMessage
  | AgentResponseMessage
  | AgentChunkMessage
  | AgentThinkingMessage
  | AgentToolCallMessage
  | ModelStatusMessage
  | AgentRunMessage
  | ModelLoadMessage
  | OffscreenToolExecuteMessage
  | OffscreenAgentResponseMessage
  | OffscreenAgentChunkMessage
  | OffscreenModelStatusMessage
