---
name: web-control-autoresearch
description: Run Gemma Gem autonomous web-control research loops. Use when improving, benchmarking, debugging, or iterating Gemma Gem's browser-control plane, MCP sidecar, observe/act/extract tools, selector grounding, extension bridge, Chrome for Testing runner, or web benchmark harness.
---

# Web Control Autoresearch

Use this skill to run measured Gemma Gem browser-control experiments. Treat Gemma Gem as the system under test and `../autoresearch-win-rtx` as a reference for the loop discipline: frozen tasks, short experiments, logs, keep wins, discard losses.

## Core Rule

Do not change control-plane behavior without a benchmark result. Run at least the relevant smoke command before and after a candidate change, then record the result in `results.web.tsv` or the generated benchmark report.

## Commands

Use `pnpm` only.

Setup and build:

```powershell
pnpm install
pnpm browser:install
pnpm build
```

Stable sidecar-contract baseline:

```powershell
pnpm benchmark:web
```

Real extension deterministic smoke:

```powershell
pnpm benchmark:web -- --real
```

Real extension plus model-driven tasks:

```powershell
pnpm benchmark:web -- --real --include-agent
```

Manual extension debugging:

```powershell
pnpm build
pnpm browser:debug
```

Then inspect extension contexts through `chrome://inspect/#extensions` or `chrome://extensions`.

Standard verification:

```powershell
pnpm compile
pnpm test:e2e
pnpm test
```

## Loop

1. Inspect `git status --short --branch`.
2. Read `program.md`, `benchmarks/web-control-plane/report.md`, and `results.web.tsv`.
3. Pick one hypothesis only.
4. Run the smallest baseline command that covers the hypothesis.
5. Edit only the files needed for that hypothesis.
6. Run the same benchmark command again.
7. Keep if task success improves, or if success is equal and JSON validity, selector hit rate, timeout rate, or action count improves.
8. Discard if success drops, JSON validity drops, bridge security weakens, or the change overfits task text.
9. Record the outcome in `results.web.tsv` and update `benchmarks/web-control-plane/report.md` when the runner does not already do so.

## Experiment Targets

Prefer work in this order:

1. Benchmark reliability: keep `pnpm benchmark:web` and `pnpm benchmark:web -- --real` green.
2. Real extension agent baseline: run `--real --include-agent`, capture failures, and classify them before changing prompts.
3. Observe/extract JSON contracts: improve prompts and validation until model-driven JSON outputs parse reliably.
4. Selector grounding: improve page briefs, observed action shapes, and deterministic helper tools.
5. Recovery policy: add bounded retry paths for missing selectors, stale tabs, bridge disconnects, and timeouts.
6. Trace data: preserve enough per-task JSONL context to train a later action/selector reranker.

## Files

- `program.md`: human-authored research program and decision rules.
- `benchmarks/web-control-plane/run.ts`: benchmark runner.
- `benchmarks/web-control-plane/tasks/*.json`: frozen task manifests.
- `benchmarks/web-control-plane/pages/*.html`: local fixture pages.
- `benchmarks/web-control-plane/report.md`: latest benchmark report.
- `results.web.tsv`: experiment ledger.
- `background/bridge-client.ts`: extension bridge client and dev benchmark hooks.
- `host/src/index.ts`: MCP sidecar tools and prompts.
- `content/tool-executors.ts`: deterministic content-script actions.

## Runner Modes

`local-fake-extension` uses the real MCP sidecar and a fake extension WebSocket. It is the fastest contract test.

`real-chrome-extension-smoke` launches Chrome for Testing, loads the built extension, serves fixture pages, and runs deterministic MCP tools through the real extension/content scripts.

`real-chrome-extension-agent` adds model-driven `gemma_agent`, `gemma_observe`, and `gemma_extract` tasks. Expect model load time and longer failures. Use it to identify the next control-plane prompt/tool experiment.

## Safety

Keep the bridge loopback-only. Do not expose the sidecar on `0.0.0.0`. Do not add unauthenticated HTTP or WebSocket paths. Keep `run_javascript` out of the default public MCP surface unless explicitly gated for development.
