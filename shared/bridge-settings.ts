export const BRIDGE_DEFAULT_PORT = 41587
export const BRIDGE_STORAGE_KEY = 'gemma_agent_bridge_settings'

export type BridgeConnectionStatus = 'disabled' | 'connecting' | 'connected' | 'disconnected' | 'error'

export type BridgeSettings = {
  enabled: boolean
  port: number
  token: string
}
export const DEFAULT_BRIDGE_SETTINGS: BridgeSettings = {
  enabled: false,
  port: BRIDGE_DEFAULT_PORT,
  token: '',
}
