import type { Message } from '@/shared/messages'
import { ensureOffscreenDocument } from './offscreen-manager'
import { log } from '@/shared/logger'

function sendToRuntime(message: Message): void {
  chrome.runtime.sendMessage(message).catch(() => {})
}

function sendToTab(tabId: number, message: Message): void {
  chrome.tabs.sendMessage(tabId, message).catch(() => {})
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

      await ensureOffscreenDocument()
      sendToRuntime({ type: 'agent:run', tabId, userMessage: message.text, settings: message.settings })
      return
    }

    case 'chat:open': {
      log.debug('chat:open — ensuring offscreen document')
      await ensureOffscreenDocument()
      sendToRuntime({ type: 'model:load' })
      return
    }

    case 'settings:update': {
      log.debug('settings:update', message.settings)
      sendToRuntime(message)
      return
    }

    case 'context:clear': {
      log.debug('context:clear')
      sendToRuntime(message)
      return
    }

    case 'tool:result': {
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
      if ('tabId' in message) {
        log.info('agent:response →', message.text.slice(0, 80))
        sendToTab(message.tabId, { type: 'agent:response', text: message.text })
      }
      return
    }

    case 'agent:chunk': {
      if ('tabId' in message) {
        sendToTab(message.tabId, { type: 'agent:chunk', text: message.text })
      }
      return
    }

    case 'model:status': {
      log.info('model:status:', message.status, message.progress ?? '', message.error ?? '')

      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (activeTab?.id) sendToTab(activeTab.id, message)
      return
    }
  }
}
