#!/usr/bin/env node
const { execFileSync } = require('node:child_process')

const port = parsePort(process.env.GEMMA_GEM_BRIDGE_PORT ?? process.argv[2])

function parsePort(value) {
  if (!value) return 41587
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    console.error(`Invalid bridge port: ${value}`)
    process.exit(1)
  }
  return parsed
}

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

function candidatePids() {
  if (process.platform === 'win32') {
    const script = [
      `$ErrorActionPreference = 'SilentlyContinue'`,
      `$connections = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort ${port} -State Listen`,
      `$connections | ForEach-Object { $_.OwningProcess }`,
    ].join('; ')
    return run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script])
      .split(/\s+/)
      .filter(Boolean)
  }

  const lsof = run('lsof', ['-nP', '-ti', `tcp:${port}`, '-sTCP:LISTEN'])
  if (lsof) return lsof.split(/\s+/).filter(Boolean)

  const fuser = run('fuser', [`${port}/tcp`])
  return fuser.split(/\s+/).filter(Boolean)
}

function commandForPid(pid) {
  if (process.platform === 'win32') {
    return run('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
    ])
  }
  return run('ps', ['-p', pid, '-o', 'command='])
}

const pids = [...new Set(candidatePids())]
if (pids.length === 0) {
  console.log(`No Gemma Gem bridge sidecar is listening on 127.0.0.1:${port}.`)
  process.exit(0)
}

let stopped = 0
for (const pid of pids) {
  const command = commandForPid(pid)
  if (!/\bnode(\.exe)?\b/i.test(command) || !/host[\\/]+src[\\/]+index\.ts|gemma-gem-bridge/i.test(command)) {
    console.log(`Refusing to stop PID ${pid}; it does not look like a Gemma Gem sidecar.`)
    continue
  }

  try {
    process.kill(Number(pid), 'SIGTERM')
    stopped += 1
    console.log(`Stopped Gemma Gem bridge sidecar on 127.0.0.1:${port} (PID ${pid}).`)
  } catch (error) {
    console.error(`Failed to stop PID ${pid}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

process.exit(stopped > 0 ? 0 : 1)
