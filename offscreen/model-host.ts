import {
  Gemma4ForConditionalGeneration,
  AutoProcessor,
  TextStreamer,
  load_image,
  env,
} from '@huggingface/transformers'
import type { ModelBackend, GenerateOptions } from '@/agent/types'
import { log } from '@/shared/logger'

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

const MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX'

type StatusCallback = (status: 'loading' | 'ready' | 'error', progress?: number, error?: string) => void

export class GemmaModelHost implements ModelBackend {
  private model: InstanceType<typeof Gemma4ForConditionalGeneration> | null = null
  private processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null = null
  private loading = false
  private onStatus: StatusCallback

  constructor(onStatus: StatusCallback) {
    this.onStatus = onStatus
  }

  async load(): Promise<void> {
    if (this.model) {
      this.onStatus('ready')
      return
    }
    if (this.loading) return
    this.loading = true

    const fileProgress = new Map<string, number>()
    let lastReportedProgress = -1

    const progress_callback = (info: { status: string, file?: string, progress?: number }) => {
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
        Gemma4ForConditionalGeneration.from_pretrained(MODEL_ID, {
          dtype: 'q4f16',
          device: 'webgpu',
          progress_callback,
        }),
        AutoProcessor.from_pretrained(MODEL_ID),
      ])

      this.model = model as InstanceType<typeof Gemma4ForConditionalGeneration>
      this.processor = processor
      this.loading = false
      this.onStatus('ready')
    } catch (e) {
      this.loading = false
      this.onStatus('error', undefined, String(e))
      throw e
    }
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    if (!this.model || !this.processor) {
      throw new Error('Model not loaded')
    }

    log.debug('Prompt length:', prompt.length, 'hasImage:', !!options?.imageDataUrl)

    log.debug('Step 1: tokenizing')
    let inputs: any
    try {
      if (options?.imageDataUrl) {
        const image = await load_image(options.imageDataUrl)
        inputs = await this.processor(prompt, image, null, { add_special_tokens: false })
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
    try {
      await this.model.generate({
        ...inputs,
        max_new_tokens: options?.maxTokens ?? 1024,
        do_sample: false,
        streamer,
      })
    } catch (e) {
      log.error('FAILED at model.generate():', e)
      throw e
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
