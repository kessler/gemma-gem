import { createGemIcon, updateGemProgress, setGemDisabled } from '@/content/gem-icon'
import { ChatOverlay } from '@/content/chat-overlay'
import type { ChatSettings } from '@/content/chat-overlay'
import { executeContentTool } from '@/content/tool-executors'
import type { Message } from '@/shared/messages'
import type { ToolCall } from '@kessler/gemma-agent'
import { MODELS, STORAGE_KEY_MODEL, DEFAULT_MODEL_ID, type ModelId } from '@/shared/models'
import {
  DEFAULT_SHORTCUTS,
  STORAGE_KEY_SHORTCUTS,
  matchesShortcut,
  type ShortcutsConfig,
} from '@/shared/shortcuts'

const STORAGE_KEY = 'gemma_disabled_sites'
const STORAGE_KEY_CHOSEN = 'gemma_model_chosen'
const PAGE_SNAPSHOT_MAX_LENGTH = 8000

function capturePageSnapshot(): string {
  const title = document.title
  const url = location.href
  const body = document.body?.innerText ?? ''
  const truncated = body.length > PAGE_SNAPSHOT_MAX_LENGTH
    ? body.slice(0, PAGE_SNAPSHOT_MAX_LENGTH) + '\n...(truncated)'
    : body

  return `url: ${url}\ntitle: ${title}\n\n${truncated}`
}

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

async function loadShortcuts(): Promise<ShortcutsConfig> {
  const data = await browser.storage.local.get(STORAGE_KEY_SHORTCUTS)
  // Merge over defaults so a stored partial/legacy value can't drop a binding.
  return { ...DEFAULT_SHORTCUTS, ...(data[STORAGE_KEY_SHORTCUTS] ?? {}) }
}

async function saveShortcuts(shortcuts: ShortcutsConfig): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY_SHORTCUTS]: shortcuts })
}

export default defineContentScript({
  matches: ['<all_urls>'],
  async main() {
    let siteDisabled = await isDisabledForSite()

    const modelData = await browser.storage.local.get(STORAGE_KEY_MODEL)
    const initialModelId: ModelId = modelData[STORAGE_KEY_MODEL] ?? DEFAULT_MODEL_ID

    let shortcuts = await loadShortcuts()

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
        stopped = false
        chat.setGenerating(true)
        chat.setInputEnabled(false)
        chat.setModelSwitchEnabled(false)
        chat.showTyping()
        const pageContext = capturePageSnapshot()
        safeSend({ type: 'chat:send', text, settings: chat.settings, pageContext } as any)
      },
      onStop() {
        stopped = true
        safeSend({ type: 'chat:stop' } as any)
        chat.finalizeThinkingStream()
        chat.finalizeStream('')
        chat.addMessage('Stopped', 'stopped')
        chat.setInputEnabled(true)
        chat.setModelSwitchEnabled(true)
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
      onModelSwitch(modelId: ModelId) {
        chat.setInputEnabled(false)
        chat.setModelSwitchEnabled(false)
        chat.addMessage(`Switching to ${MODELS[modelId].label}...`, 'agent')
        modelReady = false
        shownLoadingMessage = false
        modelEverChosen = true
        browser.storage.local.set({ [STORAGE_KEY_CHOSEN]: true })
        safeSend({ type: 'model:switch', modelId })
      },
      onShortcutsChange(next: ShortcutsConfig) {
        shortcuts = next
        saveShortcuts(next)
      },
    })

    chat.setSelectedModel(initialModelId)
    chat.setShortcuts(shortcuts)

    const modelChosenData = await browser.storage.local.get(STORAGE_KEY_CHOSEN)
    let modelEverChosen = modelChosenData[STORAGE_KEY_CHOSEN] === true

    let modelReady = false
    let shownLoadingMessage = false
    let stopped = false

    const icon = createGemIcon(async () => {
      if (siteDisabled) {
        if (confirm('Re-enable Gemma Gem on this site?')) {
          siteDisabled = false
          setDisabledForSite(false)
          setGemDisabled(false)
        }
        return
      }
      chat.toggle()
      if (modelEverChosen) {
        safeSend({ type: 'chat:open' })
      } else {
        chat.updateStatus('Select a model')
        chat.showModelPicker()
      }
    })

    document.body.appendChild(icon)
    document.body.appendChild(chat.getElement())

    if (siteDisabled) {
      setGemDisabled(true)
    }

    // Capture phase so the shortcut wins even when focus is in the chat input
    // (the input stops propagation of key events, which would otherwise swallow
    // the combo in the bubble phase). When recording a rebind, bail out and let
    // the overlay's own capture listener consume the keystroke.
    document.addEventListener('keydown', (e) => {
      if (chat.isRecording()) return

      // Toggle chat overlay (default Alt+G)
      if (matchesShortcut(e, shortcuts.toggle)) {
        if (siteDisabled) return
        e.preventDefault()
        e.stopPropagation()
        chat.toggle()
        if (chat.isVisible()) safeSend({ type: 'chat:open' })
        return
      }
      // Close chat overlay (default Escape)
      if (matchesShortcut(e, shortcuts.close) && chat.isVisible()) {
        e.preventDefault()
        e.stopPropagation()
        chat.hide()
      }
    }, true)

    browser.runtime.onMessage.addListener((message: Message) => {
      switch (message.type) {
        case 'agent:response':
          if (stopped) break
          chat.finalizeThinkingStream()
          chat.finalizeStream(message.text)
          chat.setInputEnabled(true)
          chat.setModelSwitchEnabled(true)
          break

        case 'agent:chunk':
          if (stopped) break
          if (message.text.startsWith('[Tool]')) {
            chat.finalizeThinkingStream()
            chat.addMessage(message.text, 'tool')
          } else if (message.text.startsWith('[Thinking]')) {
            chat.appendThinkingStream(message.text.replace(/^\[Thinking\]\s*/, ''))
          } else if (message.text.trim()) {
            chat.finalizeThinkingStream()
            chat.appendStream(message.text)
          }
          break

        case 'agent:tool_call':
          handleToolCall(message.requestId, message.call)
          break

        case 'gpu:warning':
          chat.addMessage(message.text, 'agent')
          break

        case 'model:status':
          if (message.status === 'loading') {
            const pct = message.progress != null ? Math.round(message.progress) : 0
            updateGemProgress(pct)
            chat.updateStatus(`Loading model... ${pct}%`)
            chat.setInputEnabled(false)
            chat.setModelSwitchEnabled(false)
            if (!shownLoadingMessage) {
              shownLoadingMessage = true
              const modelConfig = MODELS[message.modelId ?? initialModelId]
              chat.addMessage(`Downloading ${modelConfig.label}... This may take a moment on first run (${modelConfig.downloadSize}, cached after).`, 'agent')
            }
          } else if (message.status === 'ready') {
            updateGemProgress(-1)
            chat.updateStatus('Ready')
            chat.setInputEnabled(true)
            chat.setModelSwitchEnabled(true)
            if (message.modelId) {
              chat.setSelectedModel(message.modelId)
            }
            if (!modelReady) {
              modelReady = true
              chat.addMessage('Model loaded. How can I help with this page?', 'agent')
            }
          } else if (message.status === 'error') {
            updateGemProgress(-1)
            chat.updateStatus(`Error: ${message.error}`)
            chat.setModelSwitchEnabled(true)
          } else if (message.status === 'unloaded') {
            modelReady = false
            chat.updateStatus('Unloaded (inactive)')
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
