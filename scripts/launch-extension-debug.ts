import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')
const EXTENSION_DIR = resolve(REPO_ROOT, '.output', 'chrome-mv3-dev')
const PROFILE_DIR = resolve(REPO_ROOT, '.browsers', 'gemma-gem-debug-profile')

async function getFreePort(): Promise<number> {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Could not allocate a DevTools port')
  }
  const port = address.port
  server.close()
  await once(server, 'close')
  return port
}

async function resolveBrowserExecutable(): Promise<string> {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH

  const marker = resolve(REPO_ROOT, '.browsers', 'chrome-for-testing', 'chrome-path.txt')
  if (existsSync(marker)) {
    const value = (await readFile(marker, 'utf8')).trim()
    if (value && existsSync(value)) return value
  }

  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ]
  const found = candidates.find(candidate => existsSync(candidate))
  if (found) return found

  throw new Error('No browser found. Run `pnpm browser:install` or set CHROME_PATH.')
}

async function main(): Promise<void> {
  if (!existsSync(resolve(EXTENSION_DIR, 'manifest.json'))) {
    throw new Error(`Built extension not found at ${EXTENSION_DIR}. Run pnpm build first.`)
  }

  await mkdir(PROFILE_DIR, { recursive: true })
  const browser = await resolveBrowserExecutable()
  const port = process.env.GEMMA_GEM_DEBUG_PORT ? Number(process.env.GEMMA_GEM_DEBUG_PORT) : await getFreePort()
  const child = spawn(browser, [
    `--user-data-dir=${PROFILE_DIR}`,
    `--remote-debugging-port=${port}`,
    '--no-sandbox',
    '--enable-extensions',
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    `--load-extension=${EXTENSION_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], {
    stdio: 'inherit',
    detached: true,
  })
  child.unref()

  console.log(`Launched browser: ${browser}`)
  console.log(`Profile: ${PROFILE_DIR}`)
  console.log(`DevTools endpoint: http://127.0.0.1:${port}`)
  console.log('Inspect extension contexts at chrome://inspect/#extensions or chrome://extensions.')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
