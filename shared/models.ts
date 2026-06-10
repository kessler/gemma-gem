export type ModelId = 'gemma-4-e2b' | 'gemma-4-e4b' | 'lm-studio'

export interface ModelConfig {
  id: ModelId
  /** HuggingFace model id for the in-browser WebGPU backend. Empty for remote backends. */
  hfModelId: string
  label: string
  downloadSize: string
  contextLimit: number
  /** When true, this model is served by a remote OpenAI-compatible endpoint (e.g. LM Studio) instead of WebGPU. */
  remote?: boolean
}

/** Id of the remote (LM Studio / OpenAI-compatible) backend option. */
export const LM_STUDIO_MODEL_ID: ModelId = 'lm-studio'

export const MODELS: Record<ModelId, ModelConfig> = {
  'gemma-4-e2b': {
    id: 'gemma-4-e2b',
    hfModelId: 'onnx-community/gemma-4-E2B-it-ONNX',
    label: 'Gemma 4 E2B',
    downloadSize: '~500MB',
    contextLimit: 128_000,
  },
  'gemma-4-e4b': {
    id: 'gemma-4-e4b',
    hfModelId: 'onnx-community/gemma-4-E4B-it-ONNX',
    label: 'Gemma 4 E4B',
    downloadSize: '~1.5GB',
    contextLimit: 128_000,
  },
  'lm-studio': {
    id: 'lm-studio',
    hfModelId: '',
    label: 'LM Studio (local)',
    downloadSize: 'via link',
    contextLimit: 8_192,
    remote: true,
  },
}

export const DEFAULT_MODEL_ID: ModelId = 'gemma-4-e2b'
export const STORAGE_KEY_MODEL = 'gemma_selected_model'

export function isRemoteModel(id: ModelId): boolean {
  return MODELS[id]?.remote === true
}

/**
 * Connection details for a remote OpenAI-compatible text-completion endpoint.
 * LM Studio exposes one at http://localhost:1234/v1 by default.
 */
export interface RemoteEndpointConfig {
  /** Base URL up to and including /v1 (e.g. http://localhost:1234/v1). */
  baseUrl: string
  /** Model name to request. Optional — LM Studio falls back to the currently-loaded model. */
  modelName: string
  /** Optional bearer token. LM Studio ignores it; other endpoints may require it. */
  apiKey: string
  /** Context window in tokens, used for history management. */
  contextLimit: number
}

export const DEFAULT_REMOTE_CONFIG: RemoteEndpointConfig = {
  baseUrl: 'http://localhost:1234/v1',
  modelName: '',
  apiKey: '',
  contextLimit: 8_192,
}

export const STORAGE_KEY_REMOTE = 'gemma_remote_endpoint'
