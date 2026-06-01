import { setupMessageRouter } from '@/background/message-router'
import { ensureOffscreenModel } from '@/background/offscreen-manager'
import { setupAgentBridge } from '@/background/bridge-client'
import { log } from '@/shared/logger'

export default defineBackground(() => {
  log.info('Service worker started')
  setupMessageRouter()
  setupAgentBridge().catch(e => log.error('Failed to setup local agent bridge:', e))

  // Create offscreen document eagerly and start loading the selected model.
  ensureOffscreenModel().then((modelId) => {
    log.info('Offscreen document created — model loading:', modelId)
  }).catch(e => log.error('Failed to create offscreen document:', e))
})
