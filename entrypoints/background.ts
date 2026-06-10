import { setupMessageRouter } from '@/background/message-router'
import { ensureOffscreenDocument } from '@/background/offscreen-manager'
import { log } from '@/shared/logger'

export default defineBackground(() => {
  log.info('Service worker started')
  setupMessageRouter()

  // Allow content scripts to read/write chrome.storage.session (used for the
  // per-session "hide gem icon" flag). Cleared automatically on browser restart.
  chrome.storage.session
    .setAccessLevel?.({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
    .catch((e: unknown) => log.warn('Could not set session storage access level:', e))

  // Create offscreen document eagerly so model starts loading immediately
  ensureOffscreenDocument().then(() => {
    log.info('Offscreen document created — model auto-loading')
  }).catch(e => log.error('Failed to create offscreen document:', e))
})
