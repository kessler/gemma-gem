# Platform Support

Gemma Gem has two separately distributed pieces:

- Chrome extension: Manifest V3 extension loaded into Chrome.
- MCP sidecar: local Node process launched by an MCP client or by a user command.

## Supported Operating Systems

The packaged sidecar path is intended to work on Windows, macOS, and Linux wherever Node can run:

```text
Command: npx
Arguments: -y gemma-gem@latest
Environment:
GEMMA_GEM_BRIDGE_TOKEN=<token from extension settings>
```

For a long-running HTTP sidecar:

Windows PowerShell:

```powershell
$env:GEMMA_GEM_BRIDGE_TOKEN="<token from extension settings>"
npx -y gemma-gem@latest --http
```

macOS / Linux shell:

```bash
export GEMMA_GEM_BRIDGE_TOKEN="<token from extension settings>"
npx -y gemma-gem@latest --http
```

## Chrome Extension Constraints

Chrome extensions cannot silently install or launch arbitrary local processes. Native Messaging is the Chrome-supported way for an extension to start a local host process, but it requires OS-level registration:

- Windows: registry key under `NativeMessagingHosts`.
- macOS: native host manifest under the Chrome or Chromium `NativeMessagingHosts` directory.
- Linux: native host manifest under the Chrome or Chromium `NativeMessagingHosts` directory.

That means Native Messaging can be an optional installer-backed path later, but it is not zero-setup from the extension package alone.

## Current Bridge Choice

The default bridge remains:

```text
MCP client -> packaged sidecar -> localhost WebSocket -> extension service worker
```

This keeps the extension Chrome Web Store friendly:

- sidecar binds only to `127.0.0.1`
- sidecar requires `GEMMA_GEM_BRIDGE_TOKEN`
- Streamable HTTP MCP rejects non-loopback browser origins
- extension declares Chrome 116+ because the service worker bridge uses WebSocket keepalives
- setup instructions avoid hard-coded OS-specific repository paths
