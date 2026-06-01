import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { strict as assert } from 'node:assert'
import test from 'node:test'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { WebSocket } from 'ws'
import type { BridgeEvent, BridgeRequest } from '../../shared/bridge-messages'

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..')
const TOKEN = 'test-token-semantic-button'

async function getFreePort(): Promise<number> {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Could not allocate a test port')
  }
  const port = address.port
  server.close()
  await once(server, 'close')
  return port
}

function waitForOutput(child: ChildProcess, pattern: RegExp): Promise<void> {
  if (!child.stderr || !child.stdout) {
    throw new Error('Sidecar process was not started with piped stdout/stderr')
  }
  const stderr = child.stderr
  const stdout = child.stdout

  return new Promise((resolveWait, reject) => {
    let output = ''
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for ${pattern}. Output:\n${output}`))
    }, 10_000)

    function cleanup(): void {
      clearTimeout(timeout)
      stderr.off('data', onData)
      stdout.off('data', onData)
      child.off('exit', onExit)
    }

    function onData(chunk: Buffer): void {
      output += chunk.toString('utf8')
      if (pattern.test(output)) {
        cleanup()
        resolveWait()
      }
    }

    function onExit(code: number | null): void {
      cleanup()
      reject(new Error(`Sidecar exited before ready with code ${code}. Output:\n${output}`))
    }

    stderr.on('data', onData)
    stdout.on('data', onData)
    child.on('exit', onExit)
  })
}

async function connectFakeExtension(port: number): Promise<{ ws: WebSocket; requests: BridgeRequest[] }> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/extension?token=${TOKEN}`)
  await once(ws, 'open')
  const requests: BridgeRequest[] = []

  ws.on('message', data => {
    const request = JSON.parse(data.toString('utf8')) as BridgeRequest | { type: string }
    if (request.type === 'bridge:keepalive') return

    requests.push(request as BridgeRequest)
    const response = handleFakeBridgeRequest(request as BridgeRequest)
    if (Array.isArray(response)) {
      for (const event of response) {
        ws.send(JSON.stringify(event))
      }
    } else {
      ws.send(JSON.stringify(response))
    }
  })

  return { ws, requests }
}

function handleFakeBridgeRequest(request: BridgeRequest): BridgeEvent | BridgeEvent[] {
  switch (request.type) {
    case 'bridge:list_tabs':
      return {
        type: 'bridge:response',
        requestId: request.requestId,
        result: [{
          id: 7,
          active: true,
          title: 'Billing sandbox',
          url: 'http://127.0.0.1:4173/semantic-button.html',
        }],
      }

    case 'bridge:get_active_tab':
      return {
        type: 'bridge:response',
        requestId: request.requestId,
        result: {
          id: 7,
          title: 'Billing sandbox',
          url: 'http://127.0.0.1:4173/semantic-button.html',
        },
      }

    case 'bridge:run_agent': {
      assert.equal(request.tabId, 7)
      assert.match(request.prompt, /collaborating with another AI model over MCP/)
      assert.match(request.prompt, /get proof of last payment/i)
      return [
        {
          type: 'bridge:chunk',
          requestId: request.requestId,
          text: '[Thinking] The receipt download is the proof of last payment.',
        },
        {
          type: 'bridge:response',
          requestId: request.requestId,
          result: {
            text: 'SUCCESS: selected #download-receipt and downloaded receipt for INV-2026-041',
          },
        },
      ]
    }

    case 'bridge:execute_tool':
      if (request.name === 'read_page_content') {
        return {
          type: 'bridge:response',
          requestId: request.requestId,
          result: {
            content: [
              'Invoice INV-2026-041',
              'Last payment: paid',
              '<button id="download-receipt">Receipt PDF</button>',
              '<button id="download-invoice">Invoice PDF</button>',
              '<button id="payment-settings">Payment settings</button>',
            ].join('\n'),
          },
        }
      }
      return {
        type: 'bridge:response',
        requestId: request.requestId,
        result: { ok: true },
      }

    case 'bridge:stop':
      return {
        type: 'bridge:response',
        requestId: request.requestId,
        result: { stopped: true },
      }
  }
}

function toolText(result: Awaited<ReturnType<Client['callTool']>>): string {
  if ('toolResult' in result) return JSON.stringify(result.toolResult)
  return result.content
    .filter(item => item.type === 'text')
    .map(item => item.text)
    .join('\n')
}

test('HTTP sidecar delegates semantic button task through the bridge', async (t) => {
  const port = await getFreePort()
  const child = spawn(process.execPath, ['--import', 'tsx', 'host/src/index.ts', '--http'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      GEMMA_GEM_BRIDGE_TOKEN: TOKEN,
      GEMMA_GEM_BRIDGE_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(() => {
    child.kill()
  })

  await waitForOutput(child, /HTTP MCP listening/)
  const fakeExtension = await connectFakeExtension(port)
  t.after(() => {
    fakeExtension.ws.close()
  })

  const badOriginResponse = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: {
      origin: 'https://example.invalid',
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
    },
    body: '{}',
  })
  assert.equal(badOriginResponse.status, 403)

  const preflightResponse = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'OPTIONS',
    headers: {
      origin: 'http://127.0.0.1',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization, content-type',
    },
  })
  assert.equal(preflightResponse.status, 204)
  assert.equal(preflightResponse.headers.get('access-control-allow-origin'), 'http://127.0.0.1')

  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
    requestInit: {
      headers: {
        authorization: `Bearer ${TOKEN}`,
      },
    },
  })
  const client = new Client({ name: 'semantic-button-e2e', version: '0.0.0' })
  t.after(async () => {
    await client.close()
  })

  await client.connect(transport)
  const result = await client.callTool({
    name: 'gemma_agent',
    arguments: {
      tabId: 7,
      task: 'get proof of last payment',
      thinking: false,
      maxIterations: 3,
    },
  })

  assert.match(toolText(result), /#download-receipt/)
  assert.match(toolText(result), /INV-2026-041/)
  assert.equal(fakeExtension.requests.filter(request => request.type === 'bridge:run_agent').length, 1)
})
