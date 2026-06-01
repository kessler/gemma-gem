import type { Message } from '@/shared/messages'
import { DEFAULT_MODEL_ID, MODELS, STORAGE_KEY_MODEL, type ModelId } from '@/shared/models'

const OFFSCREEN_URL = 'offscreen.html'

let creating: Promise<void> | null = null

export async function ensureOffscreenDocument(): Promise<void> {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  })

  if (existingContexts.length > 0) return

  if (creating) {
    await creating
    return
  }

  creating = chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: 'Run Gemma 4 model inference via WebGPU',
  })

  try {
    await creating
  } catch (e) {
    // If creation fails, make sure we reset the creating flag
    // so subsequent calls can retry
    throw e
  } finally {
    creating = null
  }
}

export async function getSelectedModelId(): Promise<ModelId> {
  const data = await chrome.storage.local.get(STORAGE_KEY_MODEL) as Record<string, unknown>
  const storedModelId = data[STORAGE_KEY_MODEL]
  return typeof storedModelId === 'string' && storedModelId in MODELS
    ? storedModelId as ModelId
    : DEFAULT_MODEL_ID
}

export async function ensureOffscreenModel(modelId?: ModelId): Promise<ModelId> {
  const targetModelId = modelId ?? await getSelectedModelId()
  await ensureOffscreenDocument()
  await chrome.runtime.sendMessage({
    type: 'model:load',
    modelId: targetModelId,
  } satisfies Message).catch(() => {})
  return targetModelId
}
