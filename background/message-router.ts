import type { Message } from '@/shared/messages'
import { ensureOffscreenDocument, ensureOffscreenModel } from './offscreen-manager'
import { getBridgeSettings, getBridgeStatus, handleBridgeRuntimeMessage, updateBridgeSettings } from './bridge-client'
import { log } from '@/shared/logger'
import { STORAGE_KEY_MODEL } from '@/shared/models'

function sendToRuntime(message: Message): void {
  chrome.runtime.sendMessage(message).catch(() => {})
}

function sendToTab(tabId: number, message: Message): void {
  chrome.tabs.sendMessage(tabId, message).catch(() => {})
}

async function sendToActiveTab(message: Message): Promise<void> {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (activeTab?.id) sendToTab(activeTab.id, message)
}

export function setupMessageRouter(): void {
  chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
    handleMessage(message, sender).then(sendResponse).catch(e => log.error('Message handler error:', e))
    return true
  })
}

async function handleMessage(message: Message, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case 'chat:send': {
      const tabId = sender.tab?.id
      if (!tabId) return
      log.debug('chat:send from tab', tabId, message.text.slice(0, 50))

      const modelId = await ensureOffscreenModel()
      sendToRuntime({ type: 'agent:run', tabId, userMessage: message.text, modelId, settings: message.settings, pageContext: message.pageContext })
      return
    }

    case 'chat:open': {
      log.debug('chat:open — ensuring offscreen document')
      await ensureOffscreenModel()
      return
    }

    case 'settings:update': {
      log.debug('settings:update', message.settings)
      sendToRuntime(message)
      return
    }

    case 'chat:stop': {
      log.debug('chat:stop')
      sendToRuntime(message)
      return
    }

    case 'bridge:settings:get': {
      const settings = await getBridgeSettings()
      return { settings, ...getBridgeStatus() }
    }

    case 'bridge:settings:update': {
      const settings = await updateBridgeSettings(message.settings)
      return { settings, ...getBridgeStatus() }
    }

    case 'context:clear': {
      log.debug('context:clear')
      sendToRuntime(message)
      return
    }

    case 'model:switch': {
      log.debug('model:switch', message.modelId)
      await chrome.storage.local.set({ [STORAGE_KEY_MODEL]: message.modelId })
      await ensureOffscreenDocument()
      sendToRuntime(message)
      return
    }

    case 'tool:result': {
      if (handleBridgeRuntimeMessage(message)) return
      log.debug('tool:result', message.requestId)
      sendToRuntime(message)
      return
    }

    case 'tool:execute': {
      const { tabId, call, requestId } = message
      log.info('tool:execute', call.name, JSON.stringify(call.arguments))

      try {
        if (call.name === 'take_screenshot') {
          const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' })
          log.debug('screenshot captured', dataUrl.length, 'bytes')
          sendToRuntime({ type: 'tool:result', requestId, result: { screenshot: dataUrl } })
          return
        }

        if (call.name === 'run_javascript') {
          const code = call.arguments.code
          if (!code || typeof code !== 'string') {
            sendToRuntime({ type: 'tool:result', requestId, result: { error: 'No code provided' } })
            return
          }
          log.debug('executing JS in tab', tabId)
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: (code: string) => {
              try {
                const result = new Function(code)()
                if (result === undefined || result === null) return { success: true }
                return { value: String(result) }
              } catch (e) {
                return { error: String(e) }
              }
            },
            args: [call.arguments.code as string],
          })
          sendToRuntime({ type: 'tool:result', requestId, result: results[0]?.result ?? { error: 'No result' } })
          return
        }

        sendToTab(tabId, { type: 'agent:tool_call', requestId, call })
      } catch (e) {
        log.error('tool:execute failed:', call.name, e)
        sendToRuntime({ type: 'tool:result', requestId, result: { error: `Tool ${call.name} failed: ${e}` } })
      }
      return
    }

    case 'agent:response': {
      if (handleBridgeRuntimeMessage(message)) return
      if ('tabId' in message) {
        log.info('agent:response →', message.text.slice(0, 80))
        sendToTab(message.tabId, { type: 'agent:response', text: message.text })
      }
      return
    }

    case 'agent:chunk': {
      if (handleBridgeRuntimeMessage(message)) return
      if ('tabId' in message) {
        sendToTab(message.tabId, { type: 'agent:chunk', text: message.text })
      }
      return
    }

    case 'gpu:warning': {
      await sendToActiveTab(message)
      return
    }

    case 'model:status': {
      log.info('model:status:', message.status, message.progress ?? '', message.error ?? '')
      await sendToActiveTab(message)
      return
    }
  }
}
