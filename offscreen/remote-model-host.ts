import type { ModelBackend, GenerateOptions } from '@kessler/gemma-agent'
import { log } from '@/shared/logger'
import { LM_STUDIO_MODEL_ID, DEFAULT_REMOTE_CONFIG, type ModelId, type RemoteEndpointConfig } from '@/shared/models'
import { GemmaStreamFilter } from '@/offscreen/stream-filter'

type StatusCallback = (status: 'loading' | 'ready' | 'error', progress?: number, error?: string) => void

/**
 * Model backend that delegates inference to a remote OpenAI-compatible
 * text-completion endpoint (LM Studio by default). The agent builds the full
 * Gemma-formatted prompt and we POST it raw to /completions, so the same
 * special-token tool/thinking protocol applies as the in-browser backend.
 *
 * Media (images/audio) is not supported over this backend — only text prompts.
 */
export class RemoteModelHost implements ModelBackend {
  private config: RemoteEndpointConfig = { ...DEFAULT_REMOTE_CONFIG }
  private loaded = false
  private loadingModelId: ModelId | null = null
  private onStatus: StatusCallback
  private abortController: AbortController | null = null

  contextLimit = DEFAULT_REMOTE_CONFIG.contextLimit

  constructor(onStatus: StatusCallback) {
    this.onStatus = onStatus
  }

  configure(config: RemoteEndpointConfig): void {
    this.config = { ...config }
    this.contextLimit = config.contextLimit || DEFAULT_REMOTE_CONFIG.contextLimit
  }

  private completionsUrl(): string {
    const base = this.config.baseUrl.replace(/\/+$/, '')
    return `${base}/completions`
  }

  private modelsUrl(): string {
    const base = this.config.baseUrl.replace(/\/+$/, '')
    return `${base}/models`
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // Bypass ngrok's browser-warning interstitial page (harmless for non-ngrok endpoints).
      'ngrok-skip-browser-warning': '1',
    }
    if (this.config.apiKey) headers['Authorization'] = `Bearer ${this.config.apiKey}`
    return headers
  }

  async load(modelId: ModelId = LM_STUDIO_MODEL_ID): Promise<void> {
    this.loadingModelId = modelId   // set before onStatus so callback sees the right id
    log.info('RemoteModelHost.load() — checking endpoint:', this.config.baseUrl)
    this.onStatus('loading', 0)
    try {
      const res = await fetch(this.modelsUrl(), { headers: this.authHeaders() })
      if (!res.ok) {
        throw new Error(`Endpoint returned ${res.status} ${res.statusText}`)
      }
      const data = await res.json().catch(() => null)
      const models: string[] = data?.data?.map((m: { id: string }) => m.id) ?? []
      log.info('Remote endpoint reachable. Models:', models.join(', ') || '(none reported)')
      this.loaded = true
      this.loadingModelId = null
      this.onStatus('ready')
    } catch (e) {
      this.loaded = false
      this.loadingModelId = null
      const msg = `Cannot reach ${this.config.baseUrl} — is LM Studio's local server running? (${e instanceof Error ? e.message : String(e)})`
      log.error('RemoteModelHost.load() failed:', msg)
      this.onStatus('error', undefined, msg)
      throw e
    }
  }

  async unload(): Promise<void> {
    this.loaded = false
  }

  getCurrentModelId(): ModelId | null {
    // Same pattern as GemmaModelHost: return the loading id while connecting,
    // the real id once ready, null when idle/error.
    return this.loaded ? LM_STUDIO_MODEL_ID : this.loadingModelId
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  async generateRaw(prompt: string, options?: GenerateOptions): Promise<string> {
    if (options?.media && options.media.length > 0) {
      log.warn('RemoteModelHost: media inputs are not supported over the LM Studio backend and will be ignored')
    }

    const filter = new GemmaStreamFilter({
      onChunk: options?.onChunk,
      onThinkingChunk: options?.onThinkingChunk,
    })

    this.abortController = new AbortController()
    let res: Response
    try {
      res = await fetch(this.completionsUrl(), {
        method: 'POST',
        headers: this.authHeaders(),
        signal: this.abortController.signal,
        body: JSON.stringify({
          model: this.config.modelName || undefined,
          prompt,
          max_tokens: options?.maxTokens ?? 1024,
          temperature: 0,
          stream: true,
          stop: ['<end_of_turn>', '<eos>'],
        }),
      })
    } catch (e) {
      this.abortController = null
      if (e instanceof DOMException && e.name === 'AbortError') {
        log.info('Remote generation aborted by user')
        return filter.result
      }
      throw e
    }

    if (!res.ok || !res.body) {
      this.abortController = null
      const detail = await res.text().catch(() => '')
      throw new Error(`Remote completion failed: ${res.status} ${res.statusText} ${detail}`.trim())
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE events are separated by blank lines; data lines start with "data:".
        let nlIndex: number
        while ((nlIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nlIndex).trim()
          buffer = buffer.slice(nlIndex + 1)
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') continue
          try {
            const json = JSON.parse(payload)
            const text: string = json?.choices?.[0]?.text ?? ''
            if (text) filter.push(text)
          } catch {
            // Partial JSON across chunks is rare for token-sized deltas; skip.
            log.debug('Skipping unparseable SSE payload chunk')
          }
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        log.info('Remote generation aborted by user mid-stream')
        return filter.result
      }
      throw e
    } finally {
      this.abortController = null
      reader.releaseLock?.()
    }

    log.debug('Remote raw output:', filter.result.slice(0, 300))
    return filter.result
  }

  countTokens(text: string): number {
    // No remote tokenizer; approximate ~4 chars/token for history management.
    return Math.ceil(text.length / 4)
  }

  isLoaded(): boolean {
    return this.loaded
  }
}
