import type { ToolCall } from '@kessler/gemma-agent'
import type { ModelId } from './models'
import type { BridgeConnectionStatus, BridgeSettings } from './bridge-settings'

// Content Script -> Service Worker
export type ChatSettings = {
  thinking: boolean
  maxIterations: number
}

export type ChatSendMessage = {
  type: 'chat:send'
  text: string
  settings?: ChatSettings
  pageContext?: string
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

export type ChatStopMessage = {
  type: 'chat:stop'
}

export type BridgeSettingsGetMessage = {
  type: 'bridge:settings:get'
}

export type BridgeSettingsUpdateMessage = {
  type: 'bridge:settings:update'
  settings: Partial<Pick<BridgeSettings, 'enabled' | 'port'>>
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
  modelId?: ModelId
  progress?: number
  error?: string
}

export type ModelSwitchMessage = {
  type: 'model:switch'
  modelId: ModelId
}

export type BridgeStatusMessage = {
  type: 'bridge:status'
  status: BridgeConnectionStatus
  error?: string
}

export type BridgeActivityStatus = 'started' | 'chunk' | 'tool' | 'completed' | 'error'

export type BridgeActivityMessage = {
  type: 'bridge:activity'
  status: BridgeActivityStatus
  tabId?: number
  requestId?: string
  title?: string
  text?: string
  toolName?: string
  timestamp: number
}

// Service Worker -> Offscreen Document
export type AgentRunMessage = {
  type: 'agent:run'
  tabId: number
  userMessage: string
  modelId?: ModelId
  settings?: ChatSettings
  pageContext?: string
}

export type ModelLoadMessage = {
  type: 'model:load'
  modelId?: ModelId
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
  modelId?: ModelId
  progress?: number
  error?: string
}

export type GPUWarningMessage = {
  type: 'gpu:warning'
  text: string
}

export type Message =
  | ChatSendMessage
  | ChatOpenMessage
  | ChatStopMessage
  | BridgeSettingsGetMessage
  | BridgeSettingsUpdateMessage
  | SettingsUpdateMessage
  | ContextClearMessage
  | ToolResultMessage
  | AgentResponseMessage
  | AgentChunkMessage
  | AgentThinkingMessage
  | AgentToolCallMessage
  | ModelStatusMessage
  | ModelSwitchMessage
  | BridgeStatusMessage
  | BridgeActivityMessage
  | AgentRunMessage
  | ModelLoadMessage
  | OffscreenToolExecuteMessage
  | OffscreenAgentResponseMessage
  | OffscreenAgentChunkMessage
  | OffscreenModelStatusMessage
  | GPUWarningMessage
