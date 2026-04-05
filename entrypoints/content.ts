import { createGemIcon, updateGemProgress, setGemDisabled } from '@/content/gem-icon'
import { ChatOverlay } from '@/content/chat-overlay'
import type { ChatSettings } from '@/content/chat-overlay'
import { executeContentTool } from '@/content/tool-executors'
import type { Message } from '@/shared/messages'
import type { ToolCall } from '@/agent/types'

const STORAGE_KEY = 'gemma_disabled_sites'

function getSiteKey(): string {
  return location.hostname
}

async function isDisabledForSite(): Promise<boolean> {
  const data = await browser.storage.local.get(STORAGE_KEY)
  const sites: string[] = data[STORAGE_KEY] ?? []
  return sites.includes(getSiteKey())
}

async function setDisabledForSite(disabled: boolean): Promise<void> {
  const data = await browser.storage.local.get(STORAGE_KEY)
  const sites: string[] = data[STORAGE_KEY] ?? []
  const site = getSiteKey()

  if (disabled && !sites.includes(site)) {
    sites.push(site)
  } else if (!disabled) {
    const idx = sites.indexOf(site)
    if (idx !== -1) sites.splice(idx, 1)
  }

  await browser.storage.local.set({ [STORAGE_KEY]: sites })
}

export default defineContentScript({
  matches: ['<all_urls>'],
  async main() {
    let siteDisabled = await isDisabledForSite()

    function safeSend(message: Message): void {
      try {
        browser.runtime.sendMessage(message).catch(() => {
          chat.updateStatus('Extension reloaded — refresh the page')
        })
      } catch {
        chat.updateStatus('Extension reloaded — refresh the page')
      }
    }

    const chat = new ChatOverlay({
      onSend(text) {
        chat.setInputEnabled(false)
        chat.showTyping()
        safeSend({ type: 'chat:send', text, settings: chat.settings } as any)
      },
      onSettingsChange(settings: ChatSettings) {
        safeSend({ type: 'settings:update', settings } as any)
      },
      onClearContext() {
        safeSend({ type: 'context:clear' } as any)
      },
      onDisableSite() {
        siteDisabled = true
        setDisabledForSite(true)
        chat.hide()
        setGemDisabled(true)
      },
    })

    let modelReady = false
    let shownLoadingMessage = false

    const icon = createGemIcon(() => {
      if (siteDisabled) {
        if (confirm('Re-enable Gemma Gem on this site?')) {
          siteDisabled = false
          setDisabledForSite(false)
          setGemDisabled(false)
        }
        return
      }
      chat.toggle()
      safeSend({ type: 'chat:open' })
    })

    document.body.appendChild(icon)
    document.body.appendChild(chat.getElement())

    if (siteDisabled) {
      setGemDisabled(true)
    }

    browser.runtime.onMessage.addListener((message: Message) => {
      switch (message.type) {
        case 'agent:response':
          chat.finalizeThinkingStream()
          chat.finalizeStream(message.text)
          chat.setInputEnabled(true)
          break

        case 'agent:chunk':
          if (message.text.startsWith('[Tool]')) {
            chat.finalizeThinkingStream()
            chat.addMessage(message.text, 'tool')
          } else if (message.text.startsWith('[Thinking]')) {
            chat.appendThinkingStream(message.text.replace(/^\[Thinking\]\s*/, ''))
          } else {
            chat.finalizeThinkingStream()
            chat.appendStream(message.text)
          }
          break

        case 'agent:tool_call':
          handleToolCall(message.requestId, message.call)
          break

        case 'model:status':
          if (message.status === 'loading') {
            const pct = message.progress != null ? Math.round(message.progress) : 0
            updateGemProgress(pct)
            chat.updateStatus(`Loading model... ${pct}%`)
            chat.setInputEnabled(false)
            if (!shownLoadingMessage) {
              shownLoadingMessage = true
              chat.addMessage('Downloading model... This may take a moment on first run (~500MB, cached after).', 'agent')
            }
          } else if (message.status === 'ready') {
            updateGemProgress(-1)
            chat.updateStatus('Ready')
            chat.setInputEnabled(true)
            if (!modelReady) {
              modelReady = true
              chat.addMessage('Model loaded. How can I help with this page?', 'agent')
            }
          } else if (message.status === 'error') {
            updateGemProgress(-1)
            chat.updateStatus(`Error: ${message.error}`)
          }
          break
      }
    })

    function handleToolCall(requestId: string, call: ToolCall): void {
      const result = executeContentTool(call)
      if (result) {
        safeSend({ type: 'tool:result', requestId, result: result.result })
      }
    }
  },
})
