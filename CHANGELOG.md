# Changelog

## 0.3.0 (2026-05-30)

### Features

- Keyboard shortcuts to control the chat overlay: **Alt+G** toggles open/closed from anywhere on the page, **Escape** closes it
- Shortcuts are configurable from the settings panel — click a shortcut field, press the key combination to rebind, or reset to default

### Fixes

- Shortcuts now work while the chat input is focused (the input previously swallowed the key events), so Alt+G and Escape reliably toggle/close the chat from inside the overlay

## 0.2.0 (2026-04-06)

### Features

- Model selection: switch between Gemma 4 E2B (~500MB) and E4B (~1.5GB) from the settings panel
- Model selection persists across sessions via chrome.storage.local
- Model switching with proper GPU resource disposal and reload
- Incremental markdown rendering during streaming (on each newline)
- Model-specific download progress messages

## 0.1.0 (2026-04-05)

Initial release.

### Features

- Gemma 4 E2B running locally via WebGPU in an offscreen document
- Gem icon overlay on every page with model download progress ring
- Shadow DOM chat overlay with markdown rendering
- Agentic tool loop: read page content, take screenshots, click elements, type text, scroll, run JavaScript
- Native thinking/reasoning mode (togglable)
- Streaming responses into chat bubbles
- Streaming thinking with collapsible fade-masked preview
- Settings panel: thinking toggle, max iterations, clear context
- Disable per-site (persisted via chrome.storage.local)
- Truncated tool call recovery (context budget detection + thinking strip)
- System prompt with date, time, and locale
- Portable agent loop (zero Chrome dependencies, extractable to standalone library)
- Development/production build modes with conditional logging
