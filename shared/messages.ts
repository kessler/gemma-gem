import type { ToolCall } from '@kessler/gemma-agent'
import type { ModelId, RemoteEndpointConfig } from './models'

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
  remoteConfig?: RemoteEndpointConfig
}

// Content Script -> Service Worker: persist the remote endpoint settings
export type RemoteConfigUpdateMessage = {
  type: 'remote:config'
  config: RemoteEndpointConfig
}

// Content Script -> Service Worker: fetch available models from a remote endpoint
export type RemoteFetchModelsMessage = {
  type: 'remote:fetch_models'
  baseUrl: string
  apiKey: string
}

// Service Worker -> Content Script: result of a models fetch
export type RemoteModelsResultMessage = {
  type: 'remote:models_result'
  models: string[]
  error?: string
}

// Service Worker -> Offscreen Document
export type AgentRunMessage = {
  type: 'agent:run'
  tabId: number
  userMessage: string
  settings?: ChatSettings
  pageContext?: string
}

export type ModelLoadMessage = {
  type: 'model:load'
  modelId?: ModelId
  remoteConfig?: RemoteEndpointConfig
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
  | SettingsUpdateMessage
  | RemoteConfigUpdateMessage
  | ContextClearMessage
  | ToolResultMessage
  | AgentResponseMessage
  | AgentChunkMessage
  | AgentThinkingMessage
  | AgentToolCallMessage
  | ModelStatusMessage
  | ModelSwitchMessage
  | AgentRunMessage
  | ModelLoadMessage
  | OffscreenToolExecuteMessage
  | OffscreenAgentResponseMessage
  | OffscreenAgentChunkMessage
  | OffscreenModelStatusMessage
  | GPUWarningMessage
  | RemoteFetchModelsMessage
  | RemoteModelsResultMessage
