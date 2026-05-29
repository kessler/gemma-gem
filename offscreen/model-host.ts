import {
  Gemma4ForConditionalGeneration,
  AutoProcessor,
  TextStreamer,
  load_image,
  env,
} from '@huggingface/transformers'
import type { ModelBackend, GenerateOptions } from '@kessler/gemma-agent'
import { ToolResultImage, ToolResultAudio } from '@kessler/gemma-agent'
import { log } from '@/shared/logger'
import { MODELS, DEFAULT_MODEL_ID, type ModelId } from '@/shared/models'

const SPECIAL_TOKENS = new Set([
  '<eos>', '<bos>', '<end_of_turn>', '<start_of_turn>',
  '<|turn>', '<turn|>',
  '<|tool>', '<tool|>',
  '<|tool_call>', '<tool_call|>',
  '<|tool_response>', '<tool_response|>',
  '<|channel>', '<channel|>',
  '<|think|>', '<|image|>',
  '<|"|>',
])

function stripSpecialTokens(text: string): string {
  let result = text
  for (const token of SPECIAL_TOKENS) {
    if (result.includes(token)) {
      result = result.split(token).join('')
    }
  }
  return result
}

// Configure ONNX Runtime to load backend files locally instead of from CDN
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('ort/')

type StatusCallback = (status: 'loading' | 'ready' | 'error', progress?: number, error?: string) => void

export class GemmaModelHost implements ModelBackend {
  private model: InstanceType<typeof Gemma4ForConditionalGeneration> | null = null
  private processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null = null
  private loading = false
  private currentModelId: ModelId | null = null
  private lastModelId: ModelId | null = null
  private loadingModelId: ModelId | null = null
  private onStatus: StatusCallback
  private abortController: AbortController | null = null

  constructor(onStatus: StatusCallback) {
    this.onStatus = onStatus
  }

  async load(modelId: ModelId = DEFAULT_MODEL_ID): Promise<void> {
    log.info('load() called:', modelId, '| current:', this.currentModelId, '| hasModel:', !!this.model, '| loading:', this.loading)
    if (this.model && this.currentModelId === modelId) {
      this.onStatus('ready')
      return
    }
    if (this.model && this.currentModelId !== modelId) {
      log.info('Unloading current model before switching')
      await this.unload()
      log.info('Unload complete')
    }
    if (this.loading) {
      log.warn('load() blocked by loading guard — another load is in progress')
      return
    }
    this.loading = true
    this.loadingModelId = modelId

    const config = MODELS[modelId]
    log.info('Starting from_pretrained for:', config.hfModelId)
    const fileProgress = new Map<string, number>()
    let lastReportedProgress = -1

    const progress_callback = (info: { status: string, file?: string, progress?: number }) => {
      log.debug('progress_callback:', info.status, info.file ?? '', info.progress ?? '')
      if (info.status === 'progress' && info.file != null) {
        fileProgress.set(info.file, info.progress ?? 0)
        const values = [...fileProgress.values()]
        const overall = Math.round(values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1))
        if (overall !== lastReportedProgress) {
          lastReportedProgress = overall
          this.onStatus('loading', overall)
        }
      } else if (info.status === 'done' && info.file != null) {
        fileProgress.set(info.file, 100)
      } else if (info.status === 'ready') {
        this.onStatus('ready')
      }
    }

    try {
      const [model, processor] = await Promise.all([
        Gemma4ForConditionalGeneration.from_pretrained(config.hfModelId, {
          dtype: 'q4f16',
          device: 'webgpu',
          progress_callback,
        }),
        AutoProcessor.from_pretrained(config.hfModelId),
      ])

      this.model = model as InstanceType<typeof Gemma4ForConditionalGeneration>
      this.processor = processor
      this.currentModelId = modelId
      this.lastModelId = modelId
      this.loadingModelId = null
      this.contextLimit = config.contextLimit
      this.loading = false
      this.onStatus('ready')
    } catch (e) {
      this.loading = false
      this.loadingModelId = null
      this.onStatus('error', undefined, String(e))
      throw e
    }
  }

  async unload(): Promise<void> {
    log.info('unload() called, hasModel:', !!this.model)
    if (this.model) {
      log.info('Disposing model...')
      await this.model.dispose()
      log.info('Model disposed')
      this.model = null
    }
    this.processor = null
    this.currentModelId = null
    this.loading = false
  }

  getCurrentModelId(): ModelId | null {
    return this.currentModelId ?? this.loadingModelId
  }

  getLastModelId(): ModelId | null {
    return this.lastModelId
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  async generateRaw(prompt: string, options?: GenerateOptions): Promise<string> {
    if (!this.model || !this.processor) {
      throw new Error('Model not loaded')
    }

    const hasMedia = options?.media && options.media.length > 0
    log.debug('Prompt length:', prompt.length, 'hasMedia:', hasMedia)

    log.debug('Step 1: tokenizing')
    let inputs: any
    try {
      if (hasMedia) {
        const images = []
        const audios = []
        for (const m of options!.media!) {
          if (m instanceof ToolResultImage) images.push(await load_image(m.content))
          if (m instanceof ToolResultAudio) audios.push(m.content)
        }
        inputs = await this.processor(
          prompt,
          images.length > 0 ? (images.length === 1 ? images[0] : images) : null,
          audios.length > 0 ? (audios.length === 1 ? audios[0] : audios) : null,
          { add_special_tokens: false },
        )
      } else {
        inputs = this.processor.tokenizer(prompt, {
          add_special_tokens: false,
          return_tensor: 'pt',
        })
      }
    } catch (e) {
      log.error('FAILED at tokenization:', e)
      throw e
    }

    log.debug('Step 2: creating streamer')
    let rawResult = ''
    let insideThinking = false
    let insideToolCall = false
    let streamer: InstanceType<typeof TextStreamer>
    try {
      streamer = new TextStreamer(this.processor.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: false,
        callback_function: (text: string) => {
          rawResult += text

          // Track thinking blocks
          if (text.includes('<|channel>')) {
            insideThinking = true
            return
          }
          if (text.includes('<channel|>')) {
            insideThinking = false
            return
          }
          if (insideThinking) {
            const clean = text.replace(/^thought\n?/, '')
            if (clean) options?.onThinkingChunk?.(clean)
            return
          }

          // Track tool call blocks
          if (text.includes('<|tool_call>')) insideToolCall = true
          if (text.includes('<tool_call|>') || text.includes('<tool_response|>')) {
            insideToolCall = false
            return
          }
          if (insideToolCall || text.includes('<|tool_response>')) return

          const clean = stripSpecialTokens(text)
          if (clean) options?.onChunk?.(clean)
        },
      })
    } catch (e) {
      log.error('FAILED at streamer creation:', e)
      throw e
    }

    log.debug('Step 3: generating')
    this.abortController = new AbortController()
    try {
      const output = await this.model.generate({
        ...inputs,
        max_new_tokens: options?.maxTokens ?? 1024,
        do_sample: false,
        streamer,
        abort_signal: this.abortController.signal,
      })

      // Dispose output tensors (native ONNX/WebGPU memory)
      const out = output as any
      if (out?.dispose) out.dispose()
      else if (out?.data?.dispose) out.data.dispose()
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        log.info('Generation aborted by user')
        return rawResult
      }
      log.error('FAILED at model.generate():', e)
      throw e
    } finally {
      this.abortController = null

      // Dispose input tensors (native ONNX/WebGPU memory)
      for (const key of Object.keys(inputs)) {
        inputs[key]?.dispose?.()
      }
    }

    log.debug('Raw output:', rawResult.slice(0, 300))
    return rawResult
  }

  contextLimit = 128_000

  countTokens(text: string): number {
    if (!this.processor) {
      throw new Error('Cannot count tokens: model not loaded')
    }
    const { input_ids } = this.processor.tokenizer(text, { add_special_tokens: false })
    return input_ids.size
  }

  isLoaded(): boolean {
    return this.model !== null
  }
}
