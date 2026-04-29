import { marked } from 'marked'
import { MODELS, DEFAULT_MODEL_ID, type ModelId } from '@/shared/models'

marked.setOptions({ breaks: true })

export interface ChatSettings {
  thinking: boolean
  maxIterations: number
}

const DEFAULT_SETTINGS: ChatSettings = {
  thinking: true,
  maxIterations: 10,
}

const STYLES = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .chat-container {
    position: fixed;
    bottom: 80px;
    right: 20px;
    width: 380px;
    height: 500px;
    background: #0f0f19;
    border: 1px solid rgba(139, 92, 246, 0.3);
    border-radius: 12px;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    color: #e2e8f0;
    font-size: 14px;
  }

  /* Header */
  .chat-header {
    padding: 10px 16px;
    background: rgba(139, 92, 246, 0.1);
    border-bottom: 1px solid rgba(139, 92, 246, 0.2);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .chat-header-title { font-weight: 600; font-size: 14px; color: #c4b5fd; user-select: none; }
  .chat-status { font-size: 11px; color: #94a3b8; user-select: none; }
  .chat-header-right { display: flex; align-items: center; gap: 6px; }
  .chat-header-btn {
    background: none; border: none; color: #94a3b8; cursor: pointer;
    font-size: 15px; padding: 2px 4px; line-height: 1; transition: color 0.2s;
  }
  .chat-header-btn:hover { color: #e2e8f0; }

  /* Status bar */
  .chat-statusbar {
    padding: 4px 16px;
    background: rgba(139, 92, 246, 0.05);
    border-bottom: 1px solid rgba(139, 92, 246, 0.1);
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    color: #64748b;
    user-select: none;
  }
  .statusbar-tags { display: flex; gap: 8px; }
  .statusbar-tag {
    display: flex; align-items: center; gap: 3px;
  }
  .statusbar-tag.active { color: #a5b4fc; }
  .statusbar-tag.inactive { color: #475569; }
  .statusbar-clear {
    background: none; border: none; color: #64748b; cursor: pointer;
    font-size: 11px; padding: 0; transition: color 0.2s;
  }
  .statusbar-clear:hover { color: #f87171; }

  /* Settings panel */
  .settings-panel {
    padding: 12px 16px;
    background: rgba(20, 20, 35, 0.95);
    border-bottom: 1px solid rgba(139, 92, 246, 0.2);
    display: none;
    flex-direction: column;
    gap: 10px;
  }
  .settings-panel.open { display: flex; }
  .setting-row {
    display: flex; align-items: center; justify-content: space-between;
  }
  .setting-label { font-size: 12px; color: #94a3b8; }
  .setting-toggle {
    position: relative; width: 36px; height: 20px; cursor: pointer;
  }
  .setting-toggle input { opacity: 0; width: 0; height: 0; }
  .setting-toggle .slider {
    position: absolute; inset: 0; background: #334155; border-radius: 10px; transition: background 0.2s;
  }
  .setting-toggle .slider::before {
    content: ''; position: absolute; width: 14px; height: 14px; left: 3px; bottom: 3px;
    background: #94a3b8; border-radius: 50%; transition: transform 0.2s, background 0.2s;
  }
  .setting-toggle input:checked + .slider { background: rgba(99, 102, 241, 0.5); }
  .setting-toggle input:checked + .slider::before { transform: translateX(16px); background: #a5b4fc; }
  .setting-number {
    width: 50px; background: rgba(30, 30, 50, 0.6); border: 1px solid rgba(139, 92, 246, 0.2);
    border-radius: 4px; padding: 3px 6px; color: #e2e8f0; font-size: 12px; text-align: center; outline: none;
  }
  .setting-number:focus { border-color: rgba(139, 92, 246, 0.5); }
  .setting-select {
    background: rgba(30, 30, 50, 0.6); border: 1px solid rgba(139, 92, 246, 0.2);
    border-radius: 4px; padding: 3px 6px; color: #e2e8f0; font-size: 12px; outline: none; cursor: pointer;
  }
  .setting-select:focus { border-color: rgba(139, 92, 246, 0.5); }
  .setting-select:disabled { opacity: 0.4; cursor: not-allowed; }
  .setting-disable {
    background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px; padding: 6px 12px; color: #f87171; cursor: pointer;
    font-size: 12px; width: 100%; transition: background 0.2s;
  }
  .setting-disable:hover { background: rgba(239, 68, 68, 0.25); }

  /* Messages */
  .chat-messages {
    flex: 1; overflow-y: auto; padding: 12px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .message {
    padding: 8px 12px; border-radius: 8px; max-width: 85%;
    word-wrap: break-word; line-height: 1.4;
  }
  .message-user {
    white-space: pre-wrap; align-self: flex-end;
    background: rgba(99, 102, 241, 0.3); border: 1px solid rgba(99, 102, 241, 0.2);
  }
  .message-agent {
    white-space: normal; align-self: flex-start;
    background: rgba(30, 30, 50, 0.8); border: 1px solid rgba(255, 255, 255, 0.05);
  }
  .message-agent p { margin: 0 0 8px 0; }
  .message-agent p:last-child { margin-bottom: 0; }
  .message-agent code {
    background: rgba(139, 92, 246, 0.15); padding: 1px 5px; border-radius: 3px;
    font-size: 13px; font-family: 'SF Mono', Menlo, Consolas, monospace;
  }
  .message-agent pre {
    background: rgba(0, 0, 0, 0.3); padding: 8px 10px; border-radius: 6px;
    overflow-x: auto; margin: 6px 0;
  }
  .message-agent pre code { background: none; padding: 0; }
  .message-agent ul, .message-agent ol { margin: 4px 0; padding-left: 20px; }
  .message-agent li { margin: 2px 0; }
  .message-agent strong { color: #c4b5fd; }
  .message-agent a { color: #818cf8; }
  .message-agent h1, .message-agent h2, .message-agent h3 {
    font-size: 14px; font-weight: 600; color: #c4b5fd; margin: 8px 0 4px 0;
  }
  .message-stopped {
    align-self: flex-start; background: rgba(244, 63, 94, 0.1);
    border: 1px solid rgba(244, 63, 94, 0.2); font-size: 12px; color: #fb7185;
  }
  .message-tool {
    align-self: flex-start; background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.2); font-size: 12px; color: #6ee7b7; font-family: monospace;
    opacity: 0.4; transition: opacity 0.2s ease;
  }
  .message-tool:hover { opacity: 1; }
  .message-thinking {
    align-self: flex-start; background: rgba(103, 232, 249, 0.1);
    border: 1px solid rgba(103, 232, 249, 0.15); font-size: 12px; color: #67e8f9; font-style: italic;
    cursor: pointer;
    opacity: 0.4; transition: opacity 0.2s ease;
  }
  .message-thinking:hover { opacity: 1; }
  .message-thinking.pinned { opacity: 1; }
  .thinking-header {
    font-weight: 600; margin-bottom: 4px; user-select: none;
  }
  .thinking-body {
    position: relative; overflow: hidden; transition: max-height 0.3s ease;
  }
  .thinking-body.collapsed {
    max-height: 3.6em;
    -webkit-mask-image: linear-gradient(to bottom, black 40%, transparent 100%);
    mask-image: linear-gradient(to bottom, black 40%, transparent 100%);
  }
  .thinking-body.expanded {
    max-height: none;
    -webkit-mask-image: none;
    mask-image: none;
  }
  .message-thinking .thinking-content { white-space: normal; }
  .message-thinking .thinking-content p { margin: 0 0 8px 0; }
  .message-thinking .thinking-content p:last-child { margin-bottom: 0; }
  .message-thinking .thinking-content code {
    background: rgba(103, 232, 249, 0.15); padding: 1px 5px; border-radius: 3px;
    font-size: 13px; font-family: 'SF Mono', Menlo, Consolas, monospace;
  }
  .message-thinking .thinking-content pre {
    background: rgba(0, 0, 0, 0.3); padding: 8px 10px; border-radius: 6px;
    overflow-x: auto; margin: 6px 0;
  }
  .message-thinking .thinking-content pre code { background: none; padding: 0; }
  .message-thinking .thinking-content ul, .message-thinking .thinking-content ol { margin: 4px 0; padding-left: 20px; }
  .message-thinking .thinking-content li { margin: 2px 0; }
  .message-thinking .thinking-content strong { color: #67e8f9; }
  .message-thinking .thinking-content a { color: #67e8f9; }

  /* Typing indicator */
  .typing-indicator {
    align-self: flex-start; padding: 10px 16px;
    background: rgba(30, 30, 50, 0.8); border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px; display: flex; gap: 4px; align-items: center;
  }
  .typing-dot {
    width: 6px; height: 6px; border-radius: 50%; background: #94a3b8;
    animation: typing-bounce 1.4s infinite ease-in-out both;
  }
  .typing-dot:nth-child(1) { animation-delay: 0s; }
  .typing-dot:nth-child(2) { animation-delay: 0.2s; }
  .typing-dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes typing-bounce {
    0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
  }

  /* Input */
  .chat-input-area {
    padding: 12px; border-top: 1px solid rgba(139, 92, 246, 0.2);
    display: flex; gap: 8px;
  }
  .chat-input {
    flex: 1; background: rgba(30, 30, 50, 0.6); border: 1px solid rgba(139, 92, 246, 0.2);
    border-radius: 8px; padding: 8px 12px; color: #e2e8f0; font-size: 14px;
    outline: none; font-family: inherit; resize: none;
  }
  .chat-input:focus { border-color: rgba(139, 92, 246, 0.5); }
  .chat-input::placeholder { color: #64748b; }
  .chat-send, .chat-stop {
    background: rgba(99, 102, 241, 0.5); border: none; border-radius: 8px;
    width: 36px; height: 36px; color: white; cursor: pointer; transition: background 0.2s;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .chat-send:hover, .chat-stop:hover { background: rgba(99, 102, 241, 0.7); }
  .chat-send:disabled { opacity: 0.4; cursor: not-allowed; }
  .chat-stop { background: rgba(239, 68, 68, 0.5); }
  .chat-stop:hover { background: rgba(239, 68, 68, 0.7); }
  .chat-send svg, .chat-stop svg { width: 18px; height: 18px; }
`

export interface ChatOverlayCallbacks {
  onSend: (text: string) => void
  onStop: () => void
  onSettingsChange: (settings: ChatSettings) => void
  onClearContext: () => void
  onDisableSite: () => void
  onModelSwitch: (modelId: ModelId) => void
}

export class ChatOverlay {
  private host: HTMLElement
  private shadow: ShadowRoot
  private container: HTMLElement
  private messagesEl: HTMLElement
  private inputEl: HTMLTextAreaElement
  private sendBtn: HTMLButtonElement
  private stopBtn: HTMLButtonElement
  private statusEl: HTMLElement
  private settingsPanel: HTMLElement
  private thinkingTag: HTMLElement
  private iterationsTag: HTMLElement
  private modelTag: HTMLElement
  private modelSelect: HTMLSelectElement
  private typingEl: HTMLElement | null = null
  private streamEl: HTMLElement | null = null
  private streamText = ''
  private thinkingStreamEl: HTMLElement | null = null
  private thinkingStreamText = ''
  private visible = false
  settings: ChatSettings = { ...DEFAULT_SETTINGS }

  constructor(callbacks: ChatOverlayCallbacks) {
    this.host = document.createElement('div')
    this.host.id = 'gemma-gem-chat'
    this.shadow = this.host.attachShadow({ mode: 'closed' })

    const style = document.createElement('style')
    style.textContent = STYLES
    this.shadow.appendChild(style)

    this.container = document.createElement('div')
    this.container.className = 'chat-container'
    this.container.style.display = 'none'

    // Header
    const header = document.createElement('div')
    header.className = 'chat-header'
    const title = document.createElement('span')
    title.className = 'chat-header-title'
    title.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="16" height="16" style="vertical-align: -2px; margin-right: 4px;"><polygon points="24,4 38,16 10,16" fill="#c084fc" opacity="0.9"/><polygon points="10,16 24,44 4,20" fill="#818cf8" opacity="0.85"/><polygon points="38,16 24,44 44,20" fill="#7c3aed" opacity="0.85"/><polygon points="10,16 38,16 24,44" fill="#a78bfa" opacity="0.95"/><polygon points="20,10 28,10 24,18" fill="white" opacity="0.3"/></svg>Gemma Gem`
    this.statusEl = document.createElement('span')
    this.statusEl.className = 'chat-status'
    this.statusEl.textContent = 'Initializing...'

    const gearBtn = document.createElement('button')
    gearBtn.className = 'chat-header-btn'
    gearBtn.textContent = '\u2699' // gear
    gearBtn.title = 'Settings'
    gearBtn.addEventListener('click', () => {
      this.settingsPanel.classList.toggle('open')
    })

    const minimizeBtn = document.createElement('button')
    minimizeBtn.className = 'chat-header-btn'
    minimizeBtn.textContent = '\u2013'
    minimizeBtn.title = 'Minimize'
    minimizeBtn.addEventListener('click', () => this.toggle())

    const headerRight = document.createElement('div')
    headerRight.className = 'chat-header-right'
    headerRight.appendChild(this.statusEl)
    headerRight.appendChild(gearBtn)
    headerRight.appendChild(minimizeBtn)
    header.appendChild(title)
    header.appendChild(headerRight)

    // Settings panel
    this.settingsPanel = document.createElement('div')
    this.settingsPanel.className = 'settings-panel'

    const modelOptions = Object.values(MODELS).map(m =>
      `<option value="${m.id}">${m.label} (${m.downloadSize})</option>`
    ).join('')

    this.settingsPanel.innerHTML = `
      <div class="setting-row">
        <span class="setting-label">Model</span>
        <select class="setting-select" data-setting="modelId">${modelOptions}</select>
      </div>
      <div class="setting-row">
        <span class="setting-label">Thinking</span>
        <label class="setting-toggle">
          <input type="checkbox" data-setting="thinking" ${this.settings.thinking ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </div>
      <div class="setting-row">
        <span class="setting-label">Max tool iterations</span>
        <input type="number" class="setting-number" data-setting="maxIterations" value="${this.settings.maxIterations}" min="1" max="50">
      </div>
    `
    this.modelSelect = this.settingsPanel.querySelector('[data-setting="modelId"]') as HTMLSelectElement
    const disableBtn = document.createElement('button')
    disableBtn.className = 'setting-disable'
    disableBtn.textContent = 'Disable on this site'
    disableBtn.addEventListener('click', () => callbacks.onDisableSite())
    this.settingsPanel.appendChild(disableBtn)

    this.settingsPanel.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement
      const key = target.dataset.setting
      if (key === 'modelId') {
        const newModelId = target.value as ModelId
        callbacks.onModelSwitch(newModelId)
        return
      }
      if (key === 'thinking') {
        this.settings.thinking = target.checked
      } else if (key === 'maxIterations') {
        this.settings.maxIterations = parseInt(target.value, 10) || 10
      }
      this.updateStatusBar()
      callbacks.onSettingsChange(this.settings)
    })

    // Status bar
    const statusBar = document.createElement('div')
    statusBar.className = 'chat-statusbar'
    const tags = document.createElement('div')
    tags.className = 'statusbar-tags'
    this.modelTag = document.createElement('span')
    this.modelTag.className = 'statusbar-tag active'
    this.modelTag.textContent = MODELS[DEFAULT_MODEL_ID].label
    this.thinkingTag = document.createElement('span')
    this.thinkingTag.className = 'statusbar-tag active'
    this.thinkingTag.textContent = '\u{1F9E0} Thinking'
    this.iterationsTag = document.createElement('span')
    this.iterationsTag.className = 'statusbar-tag active'
    this.iterationsTag.textContent = `\u{1F504} ${this.settings.maxIterations} iters`
    tags.appendChild(this.modelTag)
    tags.appendChild(this.thinkingTag)
    tags.appendChild(this.iterationsTag)
    const clearBtn = document.createElement('button')
    clearBtn.className = 'statusbar-clear'
    clearBtn.textContent = 'Clear context'
    clearBtn.addEventListener('click', () => {
      this.messagesEl.innerHTML = ''
      callbacks.onClearContext()
      this.addMessage('Context cleared.', 'agent')
    })
    statusBar.appendChild(tags)
    statusBar.appendChild(clearBtn)

    // Messages
    this.messagesEl = document.createElement('div')
    this.messagesEl.className = 'chat-messages'

    // Input area
    const inputArea = document.createElement('div')
    inputArea.className = 'chat-input-area'
    this.inputEl = document.createElement('textarea')
    this.inputEl.className = 'chat-input'
    this.inputEl.placeholder = 'Ask about this page...'
    this.inputEl.rows = 1
    this.sendBtn = document.createElement('button')
    this.sendBtn.className = 'chat-send'
    this.sendBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'

    this.stopBtn = document.createElement('button')
    this.stopBtn.className = 'chat-stop'
    this.stopBtn.style.display = 'none'
    this.stopBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'

    inputArea.appendChild(this.inputEl)
    inputArea.appendChild(this.sendBtn)
    inputArea.appendChild(this.stopBtn)

    this.container.appendChild(header)
    this.container.appendChild(this.settingsPanel)
    this.container.appendChild(statusBar)
    this.container.appendChild(this.messagesEl)
    this.container.appendChild(inputArea)
    this.shadow.appendChild(this.container)

    this.sendBtn.addEventListener('click', () => this.handleSend(callbacks.onSend))
    this.stopBtn.addEventListener('click', () => callbacks.onStop())

    for (const event of ['keydown', 'keyup', 'keypress'] as const) {
      this.inputEl.addEventListener(event, (e) => e.stopPropagation())
    }

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        this.handleSend(callbacks.onSend)
      }
    })
  }

  private updateStatusBar(): void {
    this.thinkingTag.className = `statusbar-tag ${this.settings.thinking ? 'active' : 'inactive'}`
    this.thinkingTag.textContent = `\u{1F9E0} Thinking ${this.settings.thinking ? 'ON' : 'OFF'}`
    this.iterationsTag.textContent = `\u{1F504} ${this.settings.maxIterations} iters`
  }

  private handleSend(onSend: (text: string) => void): void {
    const text = this.inputEl.value.trim()
    if (!text) return
    this.addMessage(text, 'user')
    this.inputEl.value = ''
    onSend(text)
  }

  toggle(): void {
    this.visible = !this.visible
    this.container.style.display = this.visible ? 'flex' : 'none'
    if (this.visible) this.inputEl.focus()
  }

  hide(): void {
    this.visible = false
    this.container.style.display = 'none'
  }

  isVisible(): boolean {
    return this.visible
  }

  appendStream(text: string): void {
    this.hideTyping()
    this.streamText += text

    if (!this.streamText.trim()) return

    if (!this.streamEl) {
      this.streamEl = document.createElement('div')
      this.streamEl.className = 'message message-agent'
      if (this.typingEl) {
        this.messagesEl.insertBefore(this.streamEl, this.typingEl)
      } else {
        this.messagesEl.appendChild(this.streamEl)
      }
    }

    const lastNewline = this.streamText.lastIndexOf('\n')
    if (lastNewline === -1) {
      this.streamEl.textContent = this.streamText
    } else {
      const rendered = this.streamText.slice(0, lastNewline + 1)
      const pending = this.streamText.slice(lastNewline + 1)
      this.streamEl.innerHTML = marked.parse(rendered) as string
      if (pending) {
        this.streamEl.appendChild(document.createTextNode(pending))
      }
    }

    this.messagesEl.scrollTop = this.messagesEl.scrollHeight
  }

  finalizeStream(fullText: string): void {
    this.hideTyping()
    if (!this.streamEl) {
      if (fullText) this.addMessage(fullText, 'agent')
      return
    }
    if (!fullText) {
      this.streamEl.remove()
    } else {
      this.streamEl.innerHTML = marked.parse(fullText) as string
    }
    this.streamEl = null
    this.streamText = ''
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight
  }

  appendThinkingStream(text: string): void {
    this.hideTyping()

    if (!this.thinkingStreamEl) {
      const msg = document.createElement('div')
      msg.className = 'message message-thinking'
      const header = document.createElement('div')
      header.className = 'thinking-header'
      header.textContent = 'Thinking...'
      const body = document.createElement('div')
      body.className = 'thinking-body collapsed'
      const content = document.createElement('div')
      content.className = 'thinking-content'
      body.appendChild(content)
      msg.appendChild(header)
      msg.appendChild(body)
      msg.addEventListener('click', () => {
        msg.classList.toggle('pinned')
        body.classList.toggle('collapsed')
        body.classList.toggle('expanded')
      })
      this.messagesEl.appendChild(msg)
      this.thinkingStreamEl = content
    }

    this.thinkingStreamText += text
    this.thinkingStreamEl.textContent = this.thinkingStreamText
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight
  }

  finalizeThinkingStream(): void {
    if (this.thinkingStreamEl) {
      this.thinkingStreamEl.innerHTML = marked.parse(this.thinkingStreamText) as string
      this.thinkingStreamEl = null
      this.thinkingStreamText = ''
    }
  }

  addMessage(text: string, type: 'user' | 'agent' | 'tool' | 'thinking' | 'stopped'): void {
    if (type === 'user' || type === 'agent') {
      this.hideTyping()
    }
    const msg = document.createElement('div')
    msg.className = `message message-${type}`

    if (type === 'agent') {
      msg.innerHTML = marked.parse(text) as string
    } else if (type === 'thinking') {
      const header = document.createElement('div')
      header.className = 'thinking-header'
      header.textContent = 'Thinking...'
      const body = document.createElement('div')
      body.className = 'thinking-body collapsed'
      const content = document.createElement('div')
      content.className = 'thinking-content'
      content.innerHTML = marked.parse(text.replace(/^\[Thinking\]\s*/, '')) as string
      body.appendChild(content)
      msg.appendChild(header)
      msg.appendChild(body)
      msg.addEventListener('click', () => {
        msg.classList.toggle('pinned')
        body.classList.toggle('collapsed')
        body.classList.toggle('expanded')
      })
    } else {
      msg.textContent = text
    }

    // Insert before typing indicator so it stays at the bottom
    if (this.typingEl) {
      this.messagesEl.insertBefore(msg, this.typingEl)
    } else {
      this.messagesEl.appendChild(msg)
    }
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight
  }

  showTyping(): void {
    if (this.typingEl) return
    this.typingEl = document.createElement('div')
    this.typingEl.className = 'typing-indicator'
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div')
      dot.className = 'typing-dot'
      this.typingEl.appendChild(dot)
    }
    this.messagesEl.appendChild(this.typingEl)
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight
  }

  hideTyping(): void {
    if (this.typingEl) {
      this.typingEl.remove()
      this.typingEl = null
    }
  }

  clearMessages(): void {
    this.messagesEl.innerHTML = ''
    this.streamEl = null
    this.streamText = ''
    this.thinkingStreamEl = null
    this.thinkingStreamText = ''
  }

  setModelSwitchEnabled(enabled: boolean): void {
    this.modelSelect.disabled = !enabled
  }

  setSelectedModel(modelId: ModelId): void {
    this.modelSelect.value = modelId
    this.modelTag.textContent = MODELS[modelId].label
  }

  updateStatus(status: string): void {
    this.statusEl.textContent = status
  }

  private generating = false

  setInputEnabled(enabled: boolean): void {
    this.inputEl.disabled = !enabled
    this.sendBtn.disabled = !enabled
    if (enabled) {
      this.generating = false
      this.sendBtn.style.display = 'flex'
      this.stopBtn.style.display = 'none'
    } else if (this.generating) {
      this.sendBtn.style.display = 'none'
      this.stopBtn.style.display = 'flex'
    }
  }

  setGenerating(generating: boolean): void {
    this.generating = generating
    if (generating) {
      this.sendBtn.style.display = 'none'
      this.stopBtn.style.display = 'flex'
    }
  }

  getElement(): HTMLElement {
    return this.host
  }
}
