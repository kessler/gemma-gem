import {
  createGemIcon,
  updateGemProgress,
  setGemDisabled,
  setGemHidden,
  getGemIconPosition,
  moveGemIconBy,
  GEM_ICON_SIZE,
  type IconPosition,
} from '@/content/gem-icon'
import { ChatOverlay } from '@/content/chat-overlay'
import type { ChatSettings } from '@/content/chat-overlay'
import { executeContentTool } from '@/content/tool-executors'
import type { Message } from '@/shared/messages'
import type { ToolCall } from '@kessler/gemma-agent'
import {
  MODELS,
  STORAGE_KEY_MODEL,
  STORAGE_KEY_REMOTE,
  DEFAULT_MODEL_ID,
  DEFAULT_REMOTE_CONFIG,
  type ModelId,
  type RemoteEndpointConfig,
} from '@/shared/models'
import {
  DEFAULT_SHORTCUTS,
  STORAGE_KEY_SHORTCUTS,
  matchesShortcut,
  type ShortcutsConfig,
} from '@/shared/shortcuts'

const STORAGE_KEY = 'gemma_disabled_sites'
const STORAGE_KEY_ICON_POS = 'gemma_icon_position'
const STORAGE_KEY_CHAT_SIZE = 'gemma_chat_size'
const SESSION_KEY_ICON_HIDDEN = 'gemma_icon_hidden'
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

async function loadIconPosition(): Promise<IconPosition | null> {
  const data = await browser.storage.local.get(STORAGE_KEY_ICON_POS)
  const pos = data[STORAGE_KEY_ICON_POS]
  return pos && typeof pos.left === 'number' && typeof pos.top === 'number' ? pos : null
}

async function saveIconPosition(pos: IconPosition): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY_ICON_POS]: pos })
}

async function loadChatSize(): Promise<{ width: number; height: number } | null> {
  const data = await browser.storage.local.get(STORAGE_KEY_CHAT_SIZE)
  const s = data[STORAGE_KEY_CHAT_SIZE] as { width: number; height: number } | undefined
  return s && typeof s.width === 'number' && typeof s.height === 'number' ? s : null
}

async function saveChatSize(width: number, height: number): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY_CHAT_SIZE]: { width, height } })
}

// Per-session "hide icon" flag, scoped per hostname. Stored in session storage
// so it clears on browser restart but survives page reloads within the session.
async function isIconHiddenThisSession(): Promise<boolean> {
  const session = browser.storage.session
  if (!session) return false
  const data = await session.get(SESSION_KEY_ICON_HIDDEN)
  const hosts: string[] = data[SESSION_KEY_ICON_HIDDEN] ?? []
  return hosts.includes(getSiteKey())
}

async function setIconHiddenThisSession(hidden: boolean): Promise<void> {
  const session = browser.storage.session
  if (!session) return
  const data = await session.get(SESSION_KEY_ICON_HIDDEN)
  const hosts: string[] = data[SESSION_KEY_ICON_HIDDEN] ?? []
  const site = getSiteKey()
  if (hidden && !hosts.includes(site)) {
    hosts.push(site)
  } else if (!hidden) {
    const idx = hosts.indexOf(site)
    if (idx !== -1) hosts.splice(idx, 1)
  }
  await session.set({ [SESSION_KEY_ICON_HIDDEN]: hosts })
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

    const remoteData = await browser.storage.local.get(STORAGE_KEY_REMOTE)
    const initialRemoteConfig: RemoteEndpointConfig = {
      ...DEFAULT_REMOTE_CONFIG,
      ...(remoteData[STORAGE_KEY_REMOTE] ?? {}),
    }

    let shortcuts = await loadShortcuts()
    const initialIconPosition = await loadIconPosition()
    const initialChatSize = await loadChatSize()
    let iconHiddenThisSession = await isIconHiddenThisSession()

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
      onNewChat() {
        stopped = false
        modelReady = false
        shownLoadingMessage = false
        safeSend({ type: 'context:clear' } as any)
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
      onToggleIconHidden() {
        iconHiddenThisSession = !iconHiddenThisSession
        setGemHidden(iconHiddenThisSession)
        setIconHiddenThisSession(iconHiddenThisSession)
        chat.setIconHidden(iconHiddenThisSession)
      },
      onModelSwitch(modelId: ModelId, remoteConfig?: RemoteEndpointConfig) {
        currentModelId = modelId
        chat.setInputEnabled(false)
        chat.setModelSwitchEnabled(false)
        chat.addMessage(`Switching to ${MODELS[modelId].label}...`, 'agent')
        modelReady = false
        shownLoadingMessage = false
        safeSend({ type: 'model:switch', modelId, remoteConfig })
      },
      onRemoteConfigChange(config: RemoteEndpointConfig) {
        safeSend({ type: 'remote:config', config } as any)
      },
      onShortcutsChange(next: ShortcutsConfig) {
        shortcuts = next
        saveShortcuts(next)
      },
      onChatDrag(dx, dy) {
        if (!iconHiddenThisSession) moveGemIconBy(dx, dy)
      },
      onChatDragEnd() {
        if (iconHiddenThisSession) return
        const pos = getGemIconPosition()
        if (pos) saveIconPosition(pos)
      },
      onFetchModels(baseUrl, apiKey) {
        safeSend({ type: 'remote:fetch_models', baseUrl, apiKey } as any)
      },
      onResize(width, height) {
        saveChatSize(width, height)
      },
    })

    chat.setRemoteConfig(initialRemoteConfig)
    chat.setSelectedModel(initialModelId)
    chat.setShortcuts(shortcuts)
    chat.setIconHidden(iconHiddenThisSession)
    if (initialChatSize) chat.setSize(initialChatSize.width, initialChatSize.height)

    let modelReady = false
    let shownLoadingMessage = false
    let stopped = false
    let currentModelId: ModelId = initialModelId

    // Tracks the icon's position between consecutive live drag events so the
    // chat window can follow by the same delta. Reset when a drag ends.
    let iconDragPrev: IconPosition | null = null

    const icon = createGemIcon({
      onClick() {
        if (siteDisabled) {
          if (confirm('Re-enable Gemma Gem on this site?')) {
            siteDisabled = false
            setDisabledForSite(false)
            setGemDisabled(false)
          }
          return
        }
        openOrToggleChat()
      },
      onMove(pos) {
        saveIconPosition(pos)
        iconDragPrev = null
      },
      onDrag(pos) {
        if (iconDragPrev && chat.isVisible()) {
          chat.moveBy(pos.left - iconDragPrev.left, pos.top - iconDragPrev.top)
        }
        iconDragPrev = pos
      },
      initialPosition: initialIconPosition,
    })

    // Open the chat anchored to the icon: above it when there's room, otherwise
    // below. Both are then kept in sync by the drag handlers above.
    function placeChatNearIcon(): void {
      const el = document.getElementById('gemma-gem-icon')
      if (!el || el.style.display === 'none') return
      const pos = getGemIconPosition()
      if (!pos) return
      const { width: chatW, height: chatH } = chat.getSize()
      const gap = 12
      const left = pos.left + GEM_ICON_SIZE - chatW
      const above = pos.top - chatH - gap
      const top = above >= 0 ? above : pos.top + GEM_ICON_SIZE + gap
      chat.moveTo(left, top)
    }

    function openOrToggleChat(): void {
      const willOpen = !chat.isVisible()
      if (willOpen) placeChatNearIcon()
      chat.toggle()
      if (chat.isVisible()) safeSend({ type: 'chat:open' })
    }

    document.body.appendChild(icon)
    document.body.appendChild(chat.getElement())

    if (siteDisabled) {
      setGemDisabled(true)
    }
    if (iconHiddenThisSession) {
      setGemHidden(true)
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
        openOrToggleChat()
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
            const modelId = message.modelId ?? currentModelId
            const modelConfig = MODELS[modelId]
            const remote = modelConfig.remote === true
            const pct = message.progress != null ? Math.round(message.progress) : 0
            updateGemProgress(remote ? -1 : pct)
            chat.updateStatus(remote ? 'Connecting...' : `Loading model... ${pct}%`)
            chat.setInputEnabled(false)
            chat.setModelSwitchEnabled(false)
            if (!shownLoadingMessage) {
              shownLoadingMessage = true
              chat.addMessage(
                remote
                  ? `Connecting to ${modelConfig.label} endpoint...`
                  : `Downloading ${modelConfig.label}... This may take a moment on first run (${modelConfig.downloadSize}, cached after).`,
                'agent',
              )
            }
          } else if (message.status === 'ready') {
            updateGemProgress(-1)
            chat.updateStatus('Ready')
            chat.setInputEnabled(true)
            chat.setModelSwitchEnabled(true)
            if (message.modelId) {
              currentModelId = message.modelId
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
          }
          break

        case 'remote:models_result':
          chat.setModels(message.models, message.error)
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
