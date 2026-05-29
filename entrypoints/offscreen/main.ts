import type { Message } from '@/shared/messages'
import { Agent, image, audio, maxTurns } from '@kessler/gemma-agent'
import type { ToolDefinition, ToolResultValue } from '@kessler/gemma-agent'
import { TOOL_DEFINITIONS, type ToolDefWithMedia } from '@/shared/tool-definitions'
import { GemmaModelHost } from '@/offscreen/model-host'
import { log } from '@/shared/logger'
import { DEFAULT_MODEL_ID, type ModelId } from '@/shared/models'

function getCountry(): string {
  const locale = navigator.language || 'en-US'
  const region = locale.split('-')[1]
  if (!region) return 'unknown'
  try {
    const displayNames = new Intl.DisplayNames([locale], { type: 'region' })
    const country = displayNames.of(region)
    return country ?? 'unknown'
  } catch {
    // Intl.DisplayNames may not be supported in all environments
    // or the region code may be invalid
    return 'unknown'
  }
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
    modelId: modelHost.getCurrentModelId() ?? modelHost.getLastModelId() ?? undefined,
    progress,
    error,
  } satisfies Message)
})

// Inactivity timer — unloads model after 15 minutes of no activity
const INACTIVITY_TIMEOUT = 30 * 60 * 1000
let inactivityTimer: ReturnType<typeof setTimeout> | null = null

function resetInactivityTimer(): void {
  if (inactivityTimer) clearTimeout(inactivityTimer)
  inactivityTimer = setTimeout(() => {
    log.info('Inactivity timeout reached — unloading model')
    modelHost.unload()
    chrome.runtime.sendMessage({
      type: 'model:status',
      status: 'unloaded',
      modelId: modelHost.getLastModelId() ?? undefined,
    } satisfies Message)
  }, INACTIVITY_TIMEOUT)
}

function clearInactivityTimer(): void {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer)
    inactivityTimer = null
  }
}

// Pending tool results keyed by requestId
const pendingToolResults = new Map<string, { resolve: (result: unknown) => void, timeoutId: number }>()
let requestIdCounter = 0

const TOOL_EXECUTION_TIMEOUT = 120000 // 2 minutes

function wrapMediaValues(raw: Record<string, unknown>, def: ToolDefWithMedia): Record<string, ToolResultValue> {
  if (!def.mediaKeys) return raw as Record<string, ToolResultValue>
  const result: Record<string, ToolResultValue> = {}
  for (const [k, v] of Object.entries(raw)) {
    const mediaType = def.mediaKeys[k]
    if (mediaType === 'image' && typeof v === 'string') {
      result[k] = image(v)
    } else if (mediaType === 'audio' && typeof v === 'string') {
      result[k] = audio(v)
    } else {
      result[k] = v as ToolResultValue
    }
  }
  return result
}

function createTools(tabId: number): ToolDefinition[] {
  return TOOL_DEFINITIONS.map(def => ({
    ...def,
    async execute(args: Record<string, unknown>): Promise<Record<string, ToolResultValue>> {
      const requestId = `tool_${++requestIdCounter}`
      log.info('Executing tool:', def.name, JSON.stringify(args))

      const resultPromise = new Promise<unknown>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          pendingToolResults.delete(requestId)
          reject(new Error(`Tool ${def.name} execution timed out after ${TOOL_EXECUTION_TIMEOUT}ms`))
        }, TOOL_EXECUTION_TIMEOUT)

        pendingToolResults.set(requestId, { resolve, timeoutId })
      })

      chrome.runtime.sendMessage({
        type: 'tool:execute',
        tabId,
        requestId,
        call: { name: def.name, arguments: args },
      } satisfies Message)

      try {
        const raw = await resultPromise
        log.debug('Tool result:', def.name, JSON.stringify(raw).slice(0, 200))
        return wrapMediaValues(raw as Record<string, unknown>, def)
      } catch (e) {
        log.error('Tool execution failed:', def.name, e)
        return { error: e instanceof Error ? e.message : String(e) }
      }
    },
  }))
}

async function checkGPUCompatibility(): Promise<string | null> {
  try {
    const adapter = await navigator.gpu?.requestAdapter()
    if (!adapter) return 'WebGPU is not available on this device. The model requires a GPU with WebGPU support.'
    if (!adapter.features.has('shader-f16')) return 'Your GPU does not support f16 shaders, which this model requires. It may fail to load.'
  } catch (e) {
    log.warn('WebGPU compatibility check failed:', e)
  }
  return null
}

// Agent instance per tab
let currentAgent: Agent | null = null
let currentTabId: number | null = null

// Model loading is initiated by the background via model:load message
// (offscreen documents don't have access to chrome.storage)

chrome.runtime.onMessage.addListener(async (message: Message) => {
  switch (message.type) {
    case 'model:load': {
      const modelId = message.modelId ?? modelHost.getCurrentModelId() ?? DEFAULT_MODEL_ID
      try {
        const warning = await checkGPUCompatibility()
        if (warning) {
          chrome.runtime.sendMessage({ type: 'gpu:warning', text: warning } satisfies Message)
        }
        await modelHost.load(modelId)
        resetInactivityTimer()
      } catch (e) {
        log.error('Model load failed:', e)
      }
      break
    }

    case 'model:switch': {
      const { modelId } = message
      log.info('Switching model to:', modelId)
      resetInactivityTimer()
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
      resetInactivityTimer()
      if (currentAgent) {
        currentAgent.updateOptions({
          thinking: settings.thinking,
          maxIterations: settings.maxIterations,
        })
      }
      break
    }

    case 'chat:stop': {
      log.info('Generation stopped by user')
      resetInactivityTimer()
      modelHost.abort()
      if (currentAgent) {
        currentAgent.abort()
      }
      break
    }

    case 'context:clear': {
      log.info('Context cleared')
      resetInactivityTimer()
      if (currentAgent) {
        currentAgent.clearHistory()
      }
      break
    }

    case 'agent:run': {
      if (!modelHost.isLoaded()) {
        const modelId = modelHost.getLastModelId() ?? DEFAULT_MODEL_ID
        log.info('Model not loaded — auto-loading before agent run')
        chrome.runtime.sendMessage({
          type: 'model:status',
          status: 'loading',
          modelId,
        } satisfies Message)
        try {
          await modelHost.load(modelId)
        } catch (e) {
          log.error('Auto-load failed:', e)
          chrome.runtime.sendMessage({
            type: 'agent:response',
            tabId: message.tabId,
            text: 'Failed to reload model. Please open the chat again.',
          } satisfies Message)
          return
        }
      }
      resetInactivityTimer()

      const { tabId, userMessage, settings, pageContext } = message
      log.info('Agent run, tab:', tabId, 'message:', userMessage.slice(0, 80))

      const enableThinking = settings?.thinking ?? true
      const maxIterations = settings?.maxIterations ?? 10

      if (currentTabId !== tabId || !currentAgent) {
        log.info('Creating new agent for tab', tabId)
        currentAgent = new Agent({
          model: modelHost,
          tools: createTools(tabId),
          systemPrompt: buildSystemPrompt(pageContext),
          historyStrategy: maxTurns(1000),
          maxIterations,
          thinking: enableThinking,
          logger: log,
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
      resetInactivityTimer()
      const entry = pendingToolResults.get(message.requestId)
      if (entry) {
        clearTimeout(entry.timeoutId)
        entry.resolve(message.result)
        pendingToolResults.delete(message.requestId)
      }
      break
    }
  }
})

log.info('Offscreen document ready')
