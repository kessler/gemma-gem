const OFFSCREEN_URL = 'offscreen.html'

let creating: Promise<void> | null = null

export async function ensureOffscreenDocument(): Promise<void> {
  // @ts-expect-error - chrome.offscreen types may not be in wxt's type defs
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

  await creating
  creating = null
}
