import { setupMessageRouter } from '@/background/message-router'
import { ensureOffscreenDocument } from '@/background/offscreen-manager'
import { log } from '@/shared/logger'

export default defineBackground(() => {
  log.info('Service worker started')
  setupMessageRouter()

  // Create offscreen document eagerly so model starts loading immediately
  ensureOffscreenDocument().then(() => {
    log.info('Offscreen document created — model auto-loading')
  }).catch(e => log.error('Failed to create offscreen document:', e))
})
