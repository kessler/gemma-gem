import { BRIDGE_STORAGE_KEY, DEFAULT_BRIDGE_SETTINGS, type BridgeConnectionStatus, type BridgeSettings } from '@/shared/bridge-settings'

type SettingsResponse = {
  settings: BridgeSettings
  status: BridgeConnectionStatus
  error?: string
}

const SIDECAR_PACKAGE = 'gemma-gem@latest'
const LOCAL_REPO_PLACEHOLDER = '<path-to-gemma-gem-checkout>'
let currentStatus: BridgeConnectionStatus = 'disabled'
let currentError: string | undefined

const styles = `
  :root {
    color-scheme: dark;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #111318;
    color: #e5e7eb;
  }

  body {
    margin: 0;
    min-height: 100vh;
    background: #111318;
  }

  .page {
    max-width: 840px;
    margin: 0 auto;
    padding: 40px 24px;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    border-bottom: 1px solid #2f3542;
    padding-bottom: 20px;
    margin-bottom: 28px;
  }

  h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 650;
    letter-spacing: 0;
  }

  .subtitle {
    margin: 6px 0 0;
    color: #a7b0c0;
    font-size: 14px;
    line-height: 1.5;
  }

  .status {
    border: 1px solid #3a4252;
    color: #d8dee9;
    padding: 7px 10px;
    border-radius: 6px;
    font-size: 13px;
    white-space: nowrap;
  }

  .status.connected { border-color: #2f855a; color: #86efac; }
  .status.connecting { border-color: #64748b; color: #cbd5e1; }
  .status.error { border-color: #b91c1c; color: #fca5a5; }

  .section {
    border-top: 1px solid #252b36;
    padding: 24px 0;
  }

  .section:first-of-type {
    border-top: 0;
    padding-top: 0;
  }

  h2 {
    margin: 0 0 14px;
    font-size: 16px;
    font-weight: 650;
    letter-spacing: 0;
  }

  .row {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 20px;
    align-items: center;
    margin: 14px 0;
  }

  label {
    color: #c9d1df;
    font-size: 14px;
  }

  input {
    box-sizing: border-box;
    width: 100%;
    background: #171a21;
    border: 1px solid #3a4252;
    color: #f8fafc;
    border-radius: 6px;
    padding: 9px 10px;
    font-size: 14px;
  }

  input[readonly] {
    color: #cbd5e1;
    font-family: "SF Mono", Consolas, monospace;
    font-size: 12px;
  }

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
  }

  .inline {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  button {
    background: #2563eb;
    border: 0;
    border-radius: 6px;
    color: white;
    cursor: pointer;
    font-size: 14px;
    padding: 9px 12px;
  }

  button.secondary {
    background: #2f3542;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  pre {
    margin: 0;
    background: #0b0d12;
    border: 1px solid #252b36;
    border-radius: 6px;
    padding: 14px;
    overflow-x: auto;
    color: #dbeafe;
    font-size: 13px;
  }

  .command-block + .command-block {
    margin-top: 12px;
  }

  .command-title {
    color: #c9d1df;
    font-size: 12px;
    font-weight: 650;
    margin: 0 0 6px;
  }

  .hint {
    color: #a7b0c0;
    font-size: 13px;
    line-height: 1.5;
  }

  .error {
    color: #fca5a5;
    font-size: 13px;
  }
`

function getApp(): HTMLElement {
  const app = document.getElementById('app')
  if (!app) throw new Error('Options root missing')
  return app
}

function sendMessage<T>(message: unknown): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>
}

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function readBridgeSettings(): Promise<BridgeSettings> {
  const data = await browser.storage.local.get(BRIDGE_STORAGE_KEY) as Record<string, unknown>
  const stored = data[BRIDGE_STORAGE_KEY] as Partial<BridgeSettings> | undefined
  const settings: BridgeSettings = {
    ...DEFAULT_BRIDGE_SETTINGS,
    ...stored,
  }

  if (!settings.token) {
    settings.token = generateToken()
    await browser.storage.local.set({ [BRIDGE_STORAGE_KEY]: settings })
  }

  return settings
}

async function applyBridgeSettings(update: Partial<Pick<BridgeSettings, 'enabled' | 'port'>>): Promise<void> {
  const response = await sendMessage<SettingsResponse | null>({ type: 'bridge:settings:update', settings: update })
  if (response) {
    currentStatus = response.status
    currentError = response.error
  } else {
    const current = await readBridgeSettings()
    const next = {
      ...current,
      ...update,
      port: Number.isInteger(update.port) && update.port! > 0 && update.port! <= 65535
        ? update.port!
        : current.port,
    }
    await browser.storage.local.set({ [BRIDGE_STORAGE_KEY]: next })
    currentStatus = next.enabled ? 'disconnected' : 'disabled'
    currentError = 'Saved settings, but the background worker did not respond. Reload the extension to apply the bridge connection.'
  }
}

function statusLabel(status: BridgeConnectionStatus): string {
  switch (status) {
    case 'connected': return 'Connected'
    case 'connecting': return 'Connecting'
    case 'disconnected': return 'Disconnected'
    case 'error': return 'Error'
    case 'disabled': return 'Disabled'
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function powershellEnvLines(settings: BridgeSettings): string[] {
  const lines = [
    `$env:GEMMA_GEM_BRIDGE_TOKEN="${settings.token}"`,
  ]
  if (settings.port !== 41587) {
    lines.push(`$env:GEMMA_GEM_BRIDGE_PORT="${settings.port}"`)
  }
  return lines
}

function posixEnvLines(settings: BridgeSettings): string[] {
  const lines = [
    `export GEMMA_GEM_BRIDGE_TOKEN="${settings.token}"`,
  ]
  if (settings.port !== 41587) {
    lines.push(`export GEMMA_GEM_BRIDGE_PORT="${settings.port}"`)
  }
  return lines
}

function packagedHttpCommandFor(settings: BridgeSettings, shell: 'powershell' | 'posix'): string {
  const lines = shell === 'powershell' ? powershellEnvLines(settings) : posixEnvLines(settings)
  lines.push(`npx -y ${SIDECAR_PACKAGE} --http`)
  return lines.join('\n')
}

function localHttpCommandFor(settings: BridgeSettings, shell: 'powershell' | 'posix'): string {
  const lines = shell === 'powershell'
    ? [`cd ${LOCAL_REPO_PLACEHOLDER}`, ...powershellEnvLines(settings)]
    : [`cd ${LOCAL_REPO_PLACEHOLDER}`, ...posixEnvLines(settings)]
  lines.push('pnpm bridge:http')
  return lines.join('\n')
}

function codexConfigFor(settings: BridgeSettings): string {
  const lines = [
    `[mcp_servers.gemma_gem]`,
    `command = "npx"`,
    `args = ["-y", "${SIDECAR_PACKAGE}"]`,
    `startup_timeout_sec = 15`,
    `tool_timeout_sec = 300`,
    ``,
    `[mcp_servers.gemma_gem.env]`,
    `GEMMA_GEM_BRIDGE_TOKEN = "${settings.token}"`,
  ]
  if (settings.port !== 41587) {
    lines.push(`GEMMA_GEM_BRIDGE_PORT = "${settings.port}"`)
  }
  return lines.join('\n')
}

function mcpClientConfigFor(settings: BridgeSettings): string {
  const env = [
    `GEMMA_GEM_BRIDGE_TOKEN=${settings.token}`,
    settings.port !== 41587 ? `GEMMA_GEM_BRIDGE_PORT=${settings.port}` : '',
  ].filter(Boolean).join('\n')

  return [
    `Command: npx`,
    `Arguments: -y ${SIDECAR_PACKAGE}`,
    `Working directory: not required`,
    `Environment:`,
    env,
  ].join('\n')
}

function stopCommandFor(settings: BridgeSettings, shell: 'powershell' | 'posix'): string {
  if (settings.port === 41587) return 'pnpm bridge:stop'
  return shell === 'powershell'
    ? [`$env:GEMMA_GEM_BRIDGE_PORT="${settings.port}"`, 'pnpm bridge:stop'].join('\n')
    : [`export GEMMA_GEM_BRIDGE_PORT="${settings.port}"`, 'pnpm bridge:stop'].join('\n')
}

function commandBlock(title: string, body: string): string {
  return `<div class="command-block"><div class="command-title">${title}</div><pre>${escapeHtml(body)}</pre></div>`
}

async function copyText(text: string, button: HTMLButtonElement): Promise<void> {
  await navigator.clipboard.writeText(text)
  const previous = button.textContent
  button.textContent = 'Copied'
  button.disabled = true
  window.setTimeout(() => {
    button.textContent = previous
    button.disabled = false
  }, 1200)
}

async function render(): Promise<void> {
  const app = getApp()
  const settings = await readBridgeSettings()
  const response = await sendMessage<SettingsResponse | null>({ type: 'bridge:settings:get' }).catch(() => null)
  if (response) {
    currentStatus = response.status
    currentError = response.error
  }

  app.innerHTML = `
    <style>${styles}</style>
    <div class="page">
      <header class="header">
        <div>
          <h1>Gemma Gem Options</h1>
          <p class="subtitle">Expose your local Chrome session to private agents through the Gemma Gem MCP bridge.</p>
        </div>
        <div class="status ${currentStatus}">${statusLabel(currentStatus)}</div>
      </header>

      <section class="section">
        <h2>Local Agent Bridge</h2>
        <div class="row">
          <label for="bridge-enabled">Enable bridge</label>
          <div class="inline">
            <input id="bridge-enabled" type="checkbox" ${settings.enabled ? 'checked' : ''} />
            <span class="hint">The extension connects to a sidecar on localhost.</span>
          </div>
        </div>
        <div class="row">
          <label for="bridge-port">Port</label>
          <input id="bridge-port" type="number" min="1" max="65535" value="${settings.port}" />
        </div>
        <div class="row">
          <label for="bridge-token">Token</label>
          <div class="inline">
            <input id="bridge-token" readonly value="${settings.token}" />
            <button id="copy-token" class="secondary">Copy</button>
          </div>
        </div>
        ${currentError ? `<p class="error">${currentError}</p>` : ''}
      </section>

      <section class="section">
        <h2>Start HTTP Sidecar</h2>
        <p class="hint">Run this packaged sidecar command to keep one sidecar connected to Gemma Gem while MCP clients attach over HTTP. Chrome extensions cannot launch local processes directly, so the sidecar must be started by a local command, MCP client, or optional native host.</p>
        <div id="bridge-command">
          ${commandBlock('Windows PowerShell', packagedHttpCommandFor(settings, 'powershell'))}
          ${commandBlock('macOS / Linux shell', packagedHttpCommandFor(settings, 'posix'))}
        </div>
      </section>

      <section class="section">
        <h2>Local Checkout Sidecar</h2>
        <p class="hint">Use this while developing from this repository instead of the packaged npx command.</p>
        ${commandBlock('Windows PowerShell', localHttpCommandFor(settings, 'powershell'))}
        ${commandBlock('macOS / Linux shell', localHttpCommandFor(settings, 'posix'))}
      </section>

      <section class="section">
        <h2>Stop Sidecar</h2>
        <p class="hint">Run this if the port is already in use or before restarting an MCP client that should own the bridge.</p>
        ${commandBlock('Windows PowerShell', stopCommandFor(settings, 'powershell'))}
        ${commandBlock('macOS / Linux shell', stopCommandFor(settings, 'posix'))}
      </section>

      <section class="section">
        <h2>Codex MCP Config</h2>
        <p class="hint">Add this to your Codex config.toml, then restart Codex. Codex launches the packaged sidecar, so there is no repository path or tsx setup step.</p>
        <pre>${escapeHtml(codexConfigFor(settings))}</pre>
      </section>

      <section class="section">
        <h2>MCP Client Command</h2>
        <p class="hint">For stdio MCP clients that launch their own sidecar, use these fields and do not run the HTTP sidecar on the same port.</p>
        <pre>${escapeHtml(mcpClientConfigFor(settings))}</pre>
      </section>

      <section class="section">
        <h2>HTTP MCP Endpoint</h2>
        <p class="hint">For MCP clients that support Streamable HTTP, use this endpoint with Authorization: Bearer ${settings.token}.</p>
        <pre>${escapeHtml(`http://127.0.0.1:${settings.port}/mcp`)}</pre>
      </section>
    </div>
  `

  const enabledInput = document.getElementById('bridge-enabled') as HTMLInputElement
  const portInput = document.getElementById('bridge-port') as HTMLInputElement
  const tokenInput = document.getElementById('bridge-token') as HTMLInputElement
  const commandEl = document.getElementById('bridge-command') as HTMLElement
  const copyTokenButton = document.getElementById('copy-token') as HTMLButtonElement

  enabledInput.addEventListener('change', async () => {
    await applyBridgeSettings({ enabled: enabledInput.checked })
    await render()
  })

  portInput.addEventListener('change', async () => {
    await applyBridgeSettings({ port: Number(portInput.value) })
    await render()
  })

  copyTokenButton.addEventListener('click', () => copyText(tokenInput.value, copyTokenButton))
  commandEl.addEventListener('click', () => copyText(commandEl.textContent ?? '', copyTokenButton))
}

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === 'bridge:status') {
    render().catch(console.error)
  }
})

render().catch(error => {
  getApp().innerHTML = `<style>${styles}</style><div class="page"><p class="error">${error instanceof Error ? error.message : String(error)}</p></div>`
})
