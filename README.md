# Gemma Gem

Your personal AI assistant living right inside the browser. Gemma Gem runs Google's Gemma 4 model entirely on-device via WebGPU — no API keys, no cloud, no data leaving your machine. It can read pages, click buttons, fill forms, run JavaScript, and answer questions about any site you visit.

## Requirements

- Chrome with WebGPU support
- ~500MB disk for E2B model, ~1.5GB for E4B (cached after first run)

## Setup

```bash
pnpm install
pnpm build
```

Load the extension in `chrome://extensions` (developer mode) from `.output/chrome-mv3-dev/`.

## Usage

1. Navigate to any page
2. Click the gem icon (bottom-right corner) to open the chat
3. Wait for model to load (progress shown on icon + chat)
4. Ask questions about the page or request actions

When a local MCP client delegates work to Gemma Gem, the same floating icon shows a live Relay badge. Click it to open **Gemma Relay**, a separate background-agent view with the current task, streamed model notes, tool calls, completion state, and errors. Normal page chat stays in the **Chat** tab.

## Architecture

```
Offscreen Document          Service Worker           Content Script
(Gemma 4 + Agent Loop)  <-> (Message Router)    <-> (Chat UI + DOM Tools)
       |                         |
  WebGPU inference          Screenshot capture
  Token streaming           JS execution
```

- **Offscreen document**: Hosts the model via `@huggingface/transformers` + WebGPU. Runs the agent loop.
- **Service worker**: Routes messages between content scripts and offscreen document. Handles `take_screenshot` and `run_javascript`.
- **Content script**: Injects gem icon + shadow DOM chat overlay, including Chat and Gemma Relay views. Executes DOM tools (`read_page_content`, `click_element`, `type_text`, `scroll_page`).

## Tools

| Tool | Description | Runs in |
|------|-------------|---------|
| `read_page_content` | Read text/HTML of the page or a CSS selector | Content script |
| `take_screenshot` | Capture visible page as PNG | Service worker |
| `click_element` | Click an element by CSS selector | Content script |
| `type_text` | Type into an input by CSS selector | Content script |
| `scroll_page` | Scroll up/down by pixel amount | Content script |
| `run_javascript` | Execute JS in the page context with full DOM access | Service worker |

## Settings

Click the gear icon in the chat header:

- **Model**: Switch between Gemma 4 E2B (~500MB) and E4B (~1.5GB). Selection persists across sessions.
- **Thinking**: Toggle native Gemma 4 thinking
- **Max iterations**: Cap on tool call loops per request
- **Clear context**: Reset conversation history for the current page
- **Disable on this site**: Disable the extension per-hostname (persisted)

## Development

```bash
pnpm build              # Development build (with logging, source maps)
pnpm build:prod         # Production build (logging silenced, minified)
```

## Local Agent Bridge

Gemma Gem can expose the current browser session to local agents through an MCP sidecar.

Chrome extensions cannot silently install or launch arbitrary local processes. The low-friction path is to let the MCP client launch the packaged `gemma-gem-bridge` sidecar, or to run one HTTP sidecar yourself when multiple MCP clients should attach to the same bridge.

1. Load the extension and open Gemma Gem settings.
2. Enable **Local agent bridge**.
3. Copy the displayed bridge token.
4. Choose one MCP connection mode.

For one stdio MCP client that launches its own packaged sidecar:

```text
Command: npx
Arguments: -y gemma-gem@latest
Environment:
GEMMA_GEM_BRIDGE_TOKEN=paste-token-here
```

MCP stdio requires stdout to contain only protocol messages. The `gemma-gem-bridge` package writes bridge logs to stderr and leaves stdout for MCP.

For Codex, add the same `npx -y gemma-gem@latest` command under `[mcp_servers.gemma_gem]` in `C:\Users\vaski\.codex\config.toml`, then restart Codex. Do not also run `pnpm bridge` manually on the same port; the MCP client process owns the localhost WebSocket relay while it is running.

For an attachable sidecar that the Gemma Gem UI can show as connected while MCP clients attach over HTTP:

Windows PowerShell:

```powershell
$env:GEMMA_GEM_BRIDGE_TOKEN="paste-token-here"
npx -y gemma-gem@latest --http
```

macOS / Linux shell:

```bash
export GEMMA_GEM_BRIDGE_TOKEN="paste-token-here"
npx -y gemma-gem@latest --http
```

Then connect MCP clients to `http://127.0.0.1:41587/mcp` with `Authorization: Bearer paste-token-here`. The same process owns the extension WebSocket relay and the HTTP MCP endpoint.

When developing from this checkout, the equivalent local commands are `pnpm bridge` for stdio and `pnpm bridge:http` for HTTP.

The sidecar exposes Stagehand-style MCP tools:

- `gemma_observe`
- `gemma_act`
- `gemma_extract`
- `gemma_agent`
- `gemma_tabs`
- `gemma_active_tab`
- `gemma_screenshot`
- `gemma_stop`

If a stdio-launched sidecar fails to appear in an MCP client, check whether `127.0.0.1:41587` is already occupied by a manually started bridge and stop it with `pnpm bridge:stop`. The stop helper is cross-platform and only terminates a listening process that looks like a Gemma Gem Node sidecar.

Background MCP activity is visible in the page UI as **Gemma Relay**:

- teal badge on the floating gem while a delegated browser task is running
- amber badge when a background task completed and has details to inspect
- red badge when the MCP/browser-helper path needs attention
- Relay tab in the chat overlay for streamed chunks, tool calls, final result, and errors

## Tech Stack

- [WXT](https://wxt.dev) — Chrome extension framework (Vite-based)
- [@huggingface/transformers](https://github.com/huggingface/transformers.js) — Browser ML inference
- [marked](https://github.com/markedjs/marked) — Markdown rendering in chat
- Gemma 4 E2B / E4B (`onnx-community/gemma-4-E2B-it-ONNX`, `onnx-community/gemma-4-E4B-it-ONNX`) — q4f16 quantization, 128K context

## Debugging

All logs are prefixed with `[Gemma Gem]`. In development builds, info/debug/warn logs are active. Production builds only log errors.

- **Service worker logs**: `chrome://extensions` → Gemma Gem → "Inspect views: service worker"
- **Offscreen document logs**: `chrome://extensions` → Gemma Gem → "Inspect views: offscreen.html"
- **Content script logs**: Open DevTools on any page → Console
- **All extension pages**: `chrome://inspect#other` lists all inspectable extension contexts (service worker, offscreen document, etc.)

The offscreen document logs are the most useful — they show model loading, prompt construction, token counts, raw model output, and tool execution.

![Gemma Gem in action](screenshot.png)
![Gemma Gem in action](screenshot2.jpg)

