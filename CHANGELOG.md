# Changelog

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
