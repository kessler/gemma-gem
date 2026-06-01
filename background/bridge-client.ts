import { ensureOffscreenModel } from './offscreen-manager'
import { log } from '@/shared/logger'
import { BRIDGE_STORAGE_KEY, DEFAULT_BRIDGE_SETTINGS, type BridgeConnectionStatus, type BridgeSettings } from '@/shared/bridge-settings'
import type { BridgeEvent, BridgeRequest } from '@/shared/bridge-messages'
import type { BridgeActivityMessage, Message } from '@/shared/messages'
import type { ToolCall } from '@kessler/gemma-agent'

const KEEPALIVE_INTERVAL_MS = 20_000
const TOOL_TIMEOUT_MS = 120_000
const AGENT_TIMEOUT_MS = 300_000

let socket: WebSocket | null = null
let keepaliveId: number | null = null
let reconnectId: number | null = null
let connectionStatus: BridgeConnectionStatus = 'disabled'
let connectionError: string | undefined
let setupComplete = false

const pendingToolResults = new Map<string, { resolve: (result: unknown) => void, timeoutId: number }>()
const pendingAgentRuns = new Map<number, {
  requestId: string
  resolve: (result: { text: string }) => void
  reject: (error: Error) => void
  timeoutId: number
}>()

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function getBridgeSettings(): Promise<BridgeSettings> {
  const data = await chrome.storage.local.get(BRIDGE_STORAGE_KEY)
  const stored = data[BRIDGE_STORAGE_KEY] as Partial<BridgeSettings> | undefined
  const settings: BridgeSettings = {
    ...DEFAULT_BRIDGE_SETTINGS,
    ...stored,
  }

  if (!settings.token) {
    settings.token = generateToken()
    await chrome.storage.local.set({ [BRIDGE_STORAGE_KEY]: settings })
  }

  return settings
}

export function getBridgeStatus(): { status: BridgeConnectionStatus, error?: string } {
  return { status: connectionStatus, error: connectionError }
}

export async function updateBridgeSettings(update: Partial<Pick<BridgeSettings, 'enabled' | 'port'>>): Promise<BridgeSettings> {
  const current = await getBridgeSettings()
  const next: BridgeSettings = {
    ...current,
    ...update,
    port: normalizePort(update.port ?? current.port),
  }
  await chrome.storage.local.set({ [BRIDGE_STORAGE_KEY]: next })
  applyBridgeSettings(next)
  return next
}

export async function setupAgentBridge(): Promise<void> {
  if (setupComplete) return
  setupComplete = true

  if (import.meta.env.DEV) {
    (globalThis as typeof globalThis & {
      __gemmaGemBenchmarkConnectBridge?: (settings: BridgeSettings) => Promise<{ status: BridgeConnectionStatus, error?: string }>
      __gemmaGemBenchmarkBridgeStatus?: () => { status: BridgeConnectionStatus, error?: string }
    }).__gemmaGemBenchmarkConnectBridge = async (settings: BridgeSettings) => {
      applyBridgeSettings(settings)
      return getBridgeStatus()
    }
    ;(globalThis as typeof globalThis & {
      __gemmaGemBenchmarkBridgeStatus?: () => { status: BridgeConnectionStatus, error?: string }
    }).__gemmaGemBenchmarkBridgeStatus = () => getBridgeStatus()
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return
    const changed = changes[BRIDGE_STORAGE_KEY]
    if (!changed?.newValue) return
    applyBridgeSettings(changed.newValue as BridgeSettings)
  })

  const settings = await getBridgeSettings()
  applyBridgeSettings(settings)
}

export function handleBridgeRuntimeMessage(message: Message): boolean {
  if (message.type === 'tool:result' && message.requestId.startsWith('bridge_tool_')) {
    const entry = pendingToolResults.get(message.requestId)
    if (entry) {
      clearTimeout(entry.timeoutId)
      pendingToolResults.delete(message.requestId)
      entry.resolve(message.result)
    }
    return true
  }

  if (message.type === 'agent:chunk' && 'tabId' in message) {
    const pending = pendingAgentRuns.get(message.tabId)
    if (pending) {
      emitBridgeActivity({
        status: message.text.startsWith('[Tool]') ? 'tool' : 'chunk',
        tabId: message.tabId,
        requestId: pending.requestId,
        text: message.text,
        toolName: extractToolName(message.text),
      })
      sendToBridge({ type: 'bridge:chunk', requestId: pending.requestId, text: message.text })
      return true
    }
  }

  if (message.type === 'agent:response' && 'tabId' in message) {
    const pending = pendingAgentRuns.get(message.tabId)
    if (pending) {
      clearTimeout(pending.timeoutId)
      pendingAgentRuns.delete(message.tabId)
      emitBridgeActivity({
        status: 'completed',
        tabId: message.tabId,
        requestId: pending.requestId,
        text: message.text,
      })
      pending.resolve({ text: message.text })
      return true
    }
  }

  return false
}

function normalizePort(port: number): number {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return DEFAULT_BRIDGE_SETTINGS.port
  }
  return port
}

function applyBridgeSettings(settings: BridgeSettings): void {
  if (!settings.enabled) {
    disconnect('disabled')
    setStatus('disabled')
    return
  }
  connect(settings)
}

function clearPendingBridgeWork(reason: string): void {
  for (const [requestId, entry] of pendingToolResults.entries()) {
    clearTimeout(entry.timeoutId)
    pendingToolResults.delete(requestId)
  }

  for (const [tabId, entry] of pendingAgentRuns.entries()) {
    clearTimeout(entry.timeoutId)
    pendingAgentRuns.delete(tabId)
    emitBridgeActivity({
      status: 'error',
      tabId,
      requestId: entry.requestId,
      text: reason,
    })
    entry.reject(new Error(reason))
  }
}

function setStatus(status: BridgeConnectionStatus, error?: string): void {
  connectionStatus = status
  connectionError = error
  chrome.runtime.sendMessage({ type: 'bridge:status', status, error } satisfies Message).catch(() => {})
}

function connect(settings: BridgeSettings): void {
  disconnect('reconnect')
  setStatus('connecting')

  const url = `ws://127.0.0.1:${settings.port}/extension?token=${encodeURIComponent(settings.token)}`
  log.info('Connecting local agent bridge:', `127.0.0.1:${settings.port}`)
  socket = new WebSocket(url)

  socket.addEventListener('open', () => {
    setStatus('connected')
    startKeepalive()
  })

  socket.addEventListener('message', (event) => {
    handleBridgeMessage(event.data).catch(e => {
      log.error('Bridge request failed:', e)
    })
  })

  socket.addEventListener('close', () => {
    stopKeepalive()
    socket = null
    clearPendingBridgeWork('Gemma Gem MCP bridge disconnected')
    scheduleReconnect(settings)
  })

  socket.addEventListener('error', () => {
    setStatus('error', 'Unable to connect to local MCP bridge')
  })
}

function scheduleReconnect(settings: BridgeSettings): void {
  if (reconnectId != null) return
  setStatus('disconnected')
  reconnectId = self.setTimeout(() => {
    reconnectId = null
    connect(settings)
  }, 2_000)
}

function disconnect(reason: string): void {
  if (reconnectId != null) {
    clearTimeout(reconnectId)
    reconnectId = null
  }
  stopKeepalive()
  if (socket) {
    log.debug('Disconnecting local agent bridge:', reason)
    socket.close()
    socket = null
  }
  clearPendingBridgeWork(`Gemma Gem MCP bridge disconnected: ${reason}`)
}

function startKeepalive(): void {
  stopKeepalive()
  keepaliveId = self.setInterval(() => {
    sendRaw({ type: 'bridge:keepalive' })
  }, KEEPALIVE_INTERVAL_MS)
}

function stopKeepalive(): void {
  if (keepaliveId != null) {
    clearInterval(keepaliveId)
    keepaliveId = null
  }
}

function sendRaw(payload: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

function sendToBridge(event: BridgeEvent): void {
  sendRaw(event)
}

function emitBridgeActivity(payload: Omit<BridgeActivityMessage, 'type' | 'timestamp'>): void {
  const message: BridgeActivityMessage = {
    type: 'bridge:activity',
    timestamp: Date.now(),
    ...payload,
  }

  chrome.tabs.query({}).then(tabs => {
    for (const tab of tabs) {
      if (tab.id != null) {
        chrome.tabs.sendMessage(tab.id, message satisfies Message).catch(() => {})
      }
    }
  }).catch(() => {})
}

function extractToolName(text: string): string | undefined {
  const match = text.match(/^\[Tool\]\s*([a-zA-Z0-9_-]+)/)
  return match?.[1]
}

async function handleBridgeMessage(raw: unknown): Promise<void> {
  const text = typeof raw === 'string' ? raw : await (raw as Blob).text()
  const request = JSON.parse(text) as BridgeRequest

  try {
    const result = await dispatchBridgeRequest(request)
    sendToBridge({ type: 'bridge:response', requestId: request.requestId, result })
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    sendToBridge({ type: 'bridge:response', requestId: request.requestId, error })
  }
}

async function dispatchBridgeRequest(request: BridgeRequest): Promise<unknown> {
  switch (request.type) {
    case 'bridge:list_tabs': return listTabs()
    case 'bridge:get_active_tab': return getActiveTabInfo()
    case 'bridge:run_agent': return runAgentForBridge(request)
    case 'bridge:execute_tool': return executeToolForBridge(request.tabId, request.name, request.arguments)
    case 'bridge:stop':
      chrome.runtime.sendMessage({ type: 'chat:stop' } satisfies Message).catch(() => {})
      return { stopped: true, runId: request.runId }
  }
}

async function listTabs(): Promise<Array<{ id: number, active: boolean, title?: string, url?: string }>> {
  const tabs = await chrome.tabs.query({})
  return tabs
    .filter(tab => tab.id != null)
    .map(tab => ({
      id: tab.id!,
      active: !!tab.active,
      title: tab.title,
      url: tab.url,
    }))
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!activeTab?.id) throw new Error('No active tab is available')
  return activeTab
}

async function getActiveTabInfo(): Promise<{ id: number, title?: string, url?: string }> {
  const tab = await getActiveTab()
  return { id: tab.id!, title: tab.title, url: tab.url }
}

async function resolveTabId(tabId?: number): Promise<number> {
  if (tabId != null) return tabId
  const tab = await getActiveTab()
  return tab.id!
}

async function activateTab(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId)
  if (tab.windowId != null) {
    await chrome.windows.update(tab.windowId, { focused: true })
  }
  await chrome.tabs.update(tabId, { active: true })
}

async function runAgentForBridge(request: Extract<BridgeRequest, { type: 'bridge:run_agent' }>): Promise<{ text: string }> {
  const tabId = await resolveTabId(request.tabId)
  if (pendingAgentRuns.has(tabId)) {
    throw new Error(`Tab ${tabId} already has a bridge agent run in progress`)
  }

  const modelId = await ensureOffscreenModel()
  emitBridgeActivity({
    status: 'started',
    tabId,
    requestId: request.requestId,
    title: compactTaskTitle(request.prompt),
    text: request.prompt,
  })

  return new Promise<{ text: string }>((resolve, reject) => {
    const timeoutId = self.setTimeout(() => {
      pendingAgentRuns.delete(tabId)
      emitBridgeActivity({
        status: 'error',
        tabId,
        requestId: request.requestId,
        text: `Agent run timed out after ${AGENT_TIMEOUT_MS}ms`,
      })
      reject(new Error(`Agent run timed out after ${AGENT_TIMEOUT_MS}ms`))
    }, AGENT_TIMEOUT_MS)

    pendingAgentRuns.set(tabId, { requestId: request.requestId, resolve, reject, timeoutId })

    chrome.runtime.sendMessage({
      type: 'agent:run',
      tabId,
      userMessage: request.prompt,
      modelId,
      settings: request.settings,
    } satisfies Message).catch((e) => {
      clearTimeout(timeoutId)
      pendingAgentRuns.delete(tabId)
      emitBridgeActivity({
        status: 'error',
        tabId,
        requestId: request.requestId,
        text: e instanceof Error ? e.message : String(e),
      })
      reject(e instanceof Error ? e : new Error(String(e)))
    })
  })
}

async function executeToolForBridge(tabIdInput: number | undefined, name: string, args: Record<string, unknown>): Promise<unknown> {
  const tabId = await resolveTabId(tabIdInput)
  emitBridgeActivity({
    status: 'tool',
    tabId,
    toolName: name,
    text: `Running ${name}`,
  })

  if (name === 'take_screenshot') {
    await activateTab(tabId)
    return { screenshot: await chrome.tabs.captureVisibleTab({ format: 'png' }) }
  }

  if (name === 'run_javascript') {
    const code = args.code
    if (typeof code !== 'string' || !code) throw new Error('code parameter is required')
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (codeToRun: string) => {
        try {
          const result = new Function(codeToRun)()
          if (result === undefined || result === null) return { success: true }
          return { value: String(result) }
        } catch (e) {
          return { error: String(e) }
        }
      },
      args: [code],
    })
    return results[0]?.result ?? { error: 'No result' }
  }

  const requestId = `bridge_tool_${crypto.randomUUID()}`
  const call: ToolCall = { name, arguments: args }
  const resultPromise = new Promise<unknown>((resolve, reject) => {
    const timeoutId = self.setTimeout(() => {
      pendingToolResults.delete(requestId)
      reject(new Error(`Tool ${name} timed out after ${TOOL_TIMEOUT_MS}ms`))
    }, TOOL_TIMEOUT_MS)
    pendingToolResults.set(requestId, { resolve, timeoutId })
  })

  await chrome.tabs.sendMessage(tabId, { type: 'agent:tool_call', requestId, call } satisfies Message).catch(e => {
    const entry = pendingToolResults.get(requestId)
    if (entry) {
      clearTimeout(entry.timeoutId)
      pendingToolResults.delete(requestId)
    }
    throw e
  })

  return resultPromise
}

function compactTaskTitle(prompt: string): string {
  const oneLine = prompt.replace(/\s+/g, ' ').trim()
  if (!oneLine) return 'Background browser task'
  return oneLine.length > 72 ? `${oneLine.slice(0, 69)}...` : oneLine
}
