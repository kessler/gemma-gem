export type ModelId = 'gemma-4-e2b' | 'gemma-4-e4b'

export interface ModelConfig {
  id: ModelId
  hfModelId: string
  label: string
  downloadSize: string
  contextLimit: number
}

export const MODELS: Record<ModelId, ModelConfig> = {
  'gemma-4-e2b': {
    id: 'gemma-4-e2b',
    hfModelId: 'onnx-community/gemma-4-E2B-it-ONNX',
    label: 'Gemma 4 E2B',
    downloadSize: '~3.4GB',
    contextLimit: 128_000,
  },
  'gemma-4-e4b': {
    id: 'gemma-4-e4b',
    hfModelId: 'onnx-community/gemma-4-E4B-it-ONNX',
    label: 'Gemma 4 E4B',
    downloadSize: '~5.2GB',
    contextLimit: 128_000,
  },
}

export const DEFAULT_MODEL_ID: ModelId = 'gemma-4-e2b'
export const STORAGE_KEY_MODEL = 'gemma_selected_model'
