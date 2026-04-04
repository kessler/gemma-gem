import { defineConfig } from 'wxt'
import { cpSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'

function copyOrtFiles() {
  const require = createRequire(import.meta.url)
  // Resolve via an exported file, then walk up to the package root
  const ortEntry = require.resolve('onnxruntime-web')
  const ortDist = resolve(dirname(ortEntry))
  const destDir = resolve('public/ort')
  mkdirSync(destDir, { recursive: true })

  const files = [
    'ort-wasm-simd-threaded.asyncify.mjs',
    'ort-wasm-simd-threaded.asyncify.wasm',
  ]

  for (const file of files) {
    cpSync(resolve(ortDist, file), resolve(destDir, file), { force: true })
  }
}

copyOrtFiles()

const ALLOWED_MODES = new Set(['development', 'production'])
const modeIndex = process.argv.indexOf('--mode')
const mode = modeIndex !== -1 ? process.argv[modeIndex + 1] : 'production'
if (!ALLOWED_MODES.has(mode)) {
  throw new Error(`Invalid mode "${mode}". Allowed: ${[...ALLOWED_MODES].join(', ')}`)
}

export default defineConfig({
  manifest: {
    name: mode === 'development' ? 'Gemma Gem [dev]' : 'Gemma Gem',
    description: 'Browser AI agent powered by Gemma 4 via WebGPU',
    permissions: ['activeTab', 'scripting', 'offscreen', 'storage'],
    host_permissions: ['<all_urls>'],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
  },
  vite: () => ({
    build: {
      target: 'esnext',
      sourcemap: true,
      minify: false,
    },
  }),
})
