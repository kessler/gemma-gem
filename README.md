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
- **Content script**: Injects gem icon + shadow DOM chat overlay. Executes DOM tools (`read_page_content`, `click_element`, `type_text`, `scroll_page`).

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

## Notes

The `agent/` directory has zero dependencies. It defines interfaces (`ModelBackend`, `ToolExecutor`) and can be extracted to a standalone library.

![Gemma Gem in action](screenshot.png)
![Gemma Gem in action](screenshot2.jpg)



## Installation

```bash
pip install -r requirements.txt
```


## Contributing

Contributions are welcome! Please open an issue first.
