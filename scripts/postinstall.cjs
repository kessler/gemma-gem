const { existsSync } = require('node:fs')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')

const bin = process.platform === 'win32' ? 'wxt.cmd' : 'wxt'
const wxt = join(process.cwd(), 'node_modules', '.bin', bin)

if (!existsSync(wxt)) {
  process.exit(0)
}

const result = spawnSync(wxt, ['prepare'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
if (result.error) {
  console.error(result.error)
  process.exit(1)
}
process.exit(result.status ?? 0)
