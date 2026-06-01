#!/usr/bin/env node
const { spawnSync } = require('node:child_process')
const { resolve } = require('node:path')

const script = resolve(__dirname, '..', 'src', 'index.ts')
const result = spawnSync(process.execPath, ['--import', 'tsx', script, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
})

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 0)
