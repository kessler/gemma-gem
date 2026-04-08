import type { Message } from '@/shared/messages'
import type { ToolCall, ToolResponse } from '@/agent/types'
import { TOOL_DEFINITIONS } from '@/shared/tool-definitions'
import { AgentLoop } from '@/agent/agent-loop'
import { GemmaModelHost } from '@/offscreen/model-host'
import { log } from '@/shared/logger'
import { DEFAULT_MODEL_ID, type ModelId } from '@/shared/models'

function getCountry(): string {
  const locale = navigator.language || 'en-US'
  const region = locale.split('-')[1]
  if (!region) return 'unknown'
  const displayNames = new Intl.DisplayNames([locale], { type: 'region' })
  return displayNames.of(region) ?? 'unknown'
}

function buildSystemPrompt(pageContext?: string): string {
  const now = new Date()
  const date = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const country = getCountry()

  const lines = [
    `date: ${date}`,
    `time: ${time}`,
    `location: ${country}`,
    '',
    'You are Gemma Gem, a browser assistant running inside a Chrome extension.',
    'Your tools are connected to the page the user is chatting from. They require no URL or target — they act on that page directly.',
    'Be concise.',
  ]

  if (pageContext) {
    lines.push(
      'A snapshot of the current page text is included below. Answer questions from it directly. Only call read_page_content if the snapshot is truncated and you need more, or if you need specific HTML structure.',
      '',
      '--- PAGE SNAPSHOT ---',
      pageContext,
    )
  } else {
    lines.push('When the user asks about page content, use your tools — do not ask for a link or source.')
  }

  return lines.join('\n')
}

// ===== WebGPU Diagnostic (run via message: { type: 'webgpu:diagnose' }) =====
async function runWebGPUDiagnostic() {
  const hasGPU = 'gpu' in navigator
  log.info('navigator.gpu exists:', hasGPU)
  if (!hasGPU) {
    log.error('navigator.gpu NOT available in offscreen document')
    return false
  }
  try {
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) {
      log.error('navigator.gpu.requestAdapter() returned null')
      return false
    }
    log.info('WebGPU adapter:', {
      vendor: adapter.info?.vendor,
      architecture: adapter.info?.architecture,
      device: adapter.info?.device,
    })
    const device = await adapter.requestDevice()
    log.info('WebGPU device created successfully')
    device.destroy()
    return true
  } catch (e) {
    log.error('WebGPU init failed:', e)
    return false
  }
}

log.info('Offscreen document initializing')

// Model host — auto-load on startup
const modelHost = new GemmaModelHost((status, progress, error) => {
  chrome.runtime.sendMessage({
    type: 'model:status',
    status,
    modelId: modelHost.getCurrentModelId() ?? undefined,
    progress,
    error,
  } satisfies Message)
})

// Pending tool results keyed by requestId
const pendingToolResults = new Map<string, (result: unknown) => void>()
let requestIdCounter = 0

function createToolExecutor(tabId: number) {
  return {
    async execute(call: ToolCall): Promise<ToolResponse> {
      const requestId = `tool_${++requestIdCounter}`
      log.info('Executing tool:', call.name, JSON.stringify(call.arguments))

      const resultPromise = new Promise<unknown>((resolve) => {
        pendingToolResults.set(requestId, resolve)
      })

      chrome.runtime.sendMessage({
        type: 'tool:execute',
        tabId,
        requestId,
        call,
      } satisfies Message)

      const result = await resultPromise
      log.debug('Tool result:', call.name, JSON.stringify(result).slice(0, 200))
      return { name: call.name, result }
    },
  }
}

// Agent loop instance per tab
let currentAgent: AgentLoop | null = null
let currentTabId: number | null = null

// Model loading is initiated by the background via model:load message
// (offscreen documents don't have access to chrome.storage)

chrome.runtime.onMessage.addListener((message: Message) => {
  switch (message.type) {
    case 'model:load': {
      const modelId = message.modelId ?? modelHost.getCurrentModelId() ?? DEFAULT_MODEL_ID
      modelHost.load(modelId).catch(e => log.error('Model load failed:', e))
      break
    }

    case 'model:switch': {
      const { modelId } = message
      log.info('Switching model to:', modelId)
      if (currentAgent) {
        currentAgent.clearHistory()
      }
      currentAgent = null
      currentTabId = null
      // Storage persistence is handled by the background service worker
      modelHost.load(modelId).catch(e => log.error('Model switch failed:', e))
      break
    }

    case 'webgpu:diagnose' as Message['type']: {
      runWebGPUDiagnostic().then(ok => {
        log.info('WebGPU diagnostic result:', ok)
      })
      break
    }

    case 'settings:update': {
      const { settings } = message
      log.info('Settings updated:', settings)
      if (currentAgent) {
        currentAgent.updateOptions({
          enableThinking: settings.thinking,
          maxIterations: settings.maxIterations,
        })
      }
      break
    }

    case 'chat:stop': {
      log.info('Generation stopped by user')
      modelHost.abort()
      if (currentAgent) {
        currentAgent.abort()
      }
      break
    }

    case 'context:clear': {
      log.info('Context cleared')
      if (currentAgent) {
        currentAgent.clearHistory()
      }
      break
    }

    case 'agent:run': {
      if (!modelHost.isLoaded()) {
        chrome.runtime.sendMessage({
          type: 'agent:response',
          tabId: message.tabId,
          text: 'Model is still loading. Please wait...',
        } satisfies Message)
        return
      }

      const { tabId, userMessage, settings, pageContext } = message
      log.info('Agent run, tab:', tabId, 'message:', userMessage.slice(0, 80))

      const enableThinking = settings?.thinking ?? true
      const maxIterations = settings?.maxIterations ?? 10

      if (currentTabId !== tabId || !currentAgent) {
        log.info('Creating new agent loop for tab', tabId)
        currentAgent = new AgentLoop({
          model: modelHost,
          tools: TOOL_DEFINITIONS,
          executor: createToolExecutor(tabId),
          systemPrompt: buildSystemPrompt(pageContext),
          maxIterations,
          enableThinking,
          onThinkingChunk(text) {
            chrome.runtime.sendMessage({
              type: 'agent:chunk',
              tabId,
              text: `[Thinking] ${text}`,
            } satisfies Message)
          },
          onToolCall(call) {
            log.info('Tool call:', call.name, JSON.stringify(call.arguments))
            chrome.runtime.sendMessage({
              type: 'agent:chunk',
              tabId,
              text: `[Tool] ${call.name}(${JSON.stringify(call.arguments)})`,
            } satisfies Message)
          },
          onChunk(text) {
            chrome.runtime.sendMessage({
              type: 'agent:chunk',
              tabId,
              text,
            } satisfies Message)
          },
        })
        currentTabId = tabId
      }

      currentAgent.run(userMessage).then((result) => {
        log.info('Agent done. Iterations:', result.iterations, 'Tool calls:', result.toolCallCount)
        log.debug('Response:', result.response.slice(0, 200))
        chrome.runtime.sendMessage({
          type: 'agent:response',
          tabId,
          text: result.response,
        } satisfies Message)
      }).catch((err) => {
        log.error('Agent error:', err)
        const message = err instanceof Error ? err.message : String(err)
        chrome.runtime.sendMessage({
          type: 'agent:response',
          tabId,
          text: `Something went wrong: ${message}`,
        } satisfies Message)
      })

      break
    }

    case 'tool:result': {
      log.debug('Tool result received:', message.requestId)
      const resolve = pendingToolResults.get(message.requestId)
      if (resolve) {
        resolve(message.result)
        pendingToolResults.delete(message.requestId)
      }
      break
    }
  }
})

log.info('Offscreen document ready')
