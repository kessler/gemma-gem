# Gemma Gem Autoresearch Program: Web Control Plane

This is an autonomous-research program for improving Gemma Gem's browser control plane. The goal is not to change Gemma Gem into a generic training repo. The goal is to make the local extension and MCP sidecar measurably better at running browser tasks, then keep only changes that improve benchmarked behavior.

Gemma Gem is the system under test. The sibling repo `../autoresearch-win-rtx` is a reference for the research loop discipline: fixed benchmarks, short experiments, logs, keep wins, discard losses. Use it for ideas and local 4090-oriented experiment patterns, but do not make Gemma Gem depend on that repo.

Always use `pnpm`. Never use npm or yarn.

## Current Direction

Gemma Gem already has the right shape for a browser-agent control plane:

- Chrome MV3 extension with Gemma 4 running locally through WebGPU.
- Content tools for page reading, clicking, typing, selecting, scrolling, screenshots, and page JavaScript.
- Local MCP sidecar with Stagehand-style tools: `gemma_observe`, `gemma_act`, `gemma_extract`, `gemma_agent`, tabs, screenshot, stop, page brief, deterministic read/click/type/select/scroll helpers, and field transfer.
- Relay UI that separates foreground Chat from background MCP/Gemma Relay work.

The weak point to improve is reliability under benchmarked web tasks: selector grounding, single-action discipline, structured extraction validity, form filling, navigation recovery, timeout handling, and caller-friendly reporting.

## Primary Objective

Train a better Gemma Gem control plane through autonomous prompt, tool, policy, and harness experiments.

"Train" means improve the control system around the local model first:

- system prompts used by MCP tools and offscreen agent loops
- observe/act/extract contracts
- selector discovery and page-brief formatting
- deterministic helper tools exposed by the sidecar
- retries, timeout budgets, and task stop behavior
- benchmark task manifests and evaluation scoring

Only add actual model fine-tuning after the benchmark harness proves a stable data format and exposes enough failure traces to justify it.

## Branch

Run this work on a dedicated branch:

```powershell
git switch -c codex/autoresearch-testing
```

If the branch already exists, switch to it. Preserve any existing user changes. Do not reset the whole repository to discard one failed experiment. Revert only the files changed by the current experiment, and only after recording the failure.

## Success Metrics

Primary metric:

- `task_success_rate`: fraction of frozen benchmark tasks completed correctly.

Secondary metrics:

- `strict_success_rate`: fraction passing exact assertions with no tolerated recovery.
- `json_valid_rate`: fraction of `gemma_observe` / `gemma_extract` outputs that parse as valid JSON when JSON is requested.
- `selector_hit_rate`: fraction of planned selectors that exist and point at the intended element.
- `actions_per_success`: fewer is better when success is equal.
- `timeout_rate`: lower is better.
- `p50_task_seconds` and `p95_task_seconds`: lower is better once success is stable.
- `tool_error_rate`: lower is better.

Target:

- First target: create a deterministic local web benchmark harness and establish a baseline.
- Near-term target: improve `task_success_rate` by at least 15 percentage points over that baseline without increasing `p95_task_seconds` by more than 50%.
- Longer target: pass a local suite plus at least one external web-agent benchmark subset, such as MiniWoB++/BrowserGym-style tasks, using the Gemma Gem MCP surface.

## Benchmark Harness

Build the frozen local benchmark before changing control-plane behavior.

Suggested structure:

```text
benchmarks/
  web-control-plane/
    tasks/
      forms.json
      extraction.json
      navigation.json
      semantic-buttons.json
    pages/
      forms.html
      extraction.html
      navigation.html
      semantic-buttons.html
    run.ts
    report.md
results.web.tsv
```

The harness should:

- start a local static web server on `127.0.0.1`
- launch or connect to Chrome with Gemma Gem loaded when possible
- run tasks through the MCP sidecar HTTP transport
- evaluate observable page state, URL, DOM text, downloaded/result values, and JSON validity
- emit machine-readable JSONL logs plus a short summary
- write `results.web.tsv`

If full extension automation is not ready yet, begin with sidecar-level contract tests using a fake extension WebSocket, then add real-browser tests once stable. Existing `host/test/semantic-button.e2e.test.ts` is the starting pattern.

## Frozen Eval Rule

After the local benchmark task set is created and baseline results are recorded, treat the task definitions, expected assertions, and scoring code as frozen.

Allowed:

- add new tasks in a new named suite
- fix true bugs in the evaluator
- improve diagnostics and logging

Not allowed:

- weakening assertions to make a candidate pass
- changing expected answers after seeing failures
- removing hard tasks from the frozen baseline suite

## In-Scope Edits

Edit these when running experiments:

- `host/src/index.ts`: MCP tool descriptions, prompts, sidecar orchestration, helper tools, validation, task result shape.
- `shared/bridge-messages.ts`: bridge protocol additions needed by benchmarks or tools.
- `background/bridge-client.ts`: timeout behavior, bridge execution routing, activity events, deterministic tool execution.
- `content/tool-executors.ts`: browser action reliability and DOM-result detail.
- `shared/tool-definitions.ts`: low-level tool schemas and descriptions used by the local Gemma loop.
- `offscreen/model-host.ts` and offscreen entry code: only for generation/control issues, stop behavior, chunk filtering, or model invocation settings.
- `host/test/*.test.ts` and `benchmarks/web-control-plane/**`: benchmark and contract tests.
- Docs and reports that record the current best control plane.

Avoid broad UI changes in this program. If UI work becomes necessary, use `.claude/skills/frontend-design/SKILL.md` and keep the extension UI compact, distinctive, and clear about foreground Chat versus background Gemma Relay work.

## Out-of-Scope Until Benchmarks Exist

Do not start with:

- adding unrelated model providers
- replacing the extension architecture
- making the sidecar network-accessible beyond loopback
- cloud inference
- broad visual redesign
- training model weights before the benchmark harness exists

## Experiment Loop

One experiment means one focused idea. Examples:

- Make `gemma_observe` return JSON that always validates against `ObservedAction[]`.
- Add a deterministic `gemma_click_text` or `gemma_find_interactive` helper if selector grounding is the failure mode.
- Improve `gemma_page_brief` so caller agents see labels, roles, ids, names, values, and nearby text without excessive page noise.
- Tighten `gemma_act` so it performs exactly one action and rejects multi-step prompts.
- Add recovery when a selector misses: re-read page, inspect candidate controls, retry once with a derived selector.
- Add benchmark tasks for checkout-like forms, settings pages, tab-to-tab field transfer, and structured table extraction.

Loop:

1. Inspect branch and working tree.
2. Pick one experiment and write down the hypothesis in the log.
3. Edit only the files needed for that idea.
4. Run the smallest relevant check.
5. Run the benchmark command.
6. Record metrics in `results.web.tsv`.
7. Keep if the change improves the primary metric or materially improves a secondary metric with no primary regression.
8. Discard if success drops, JSON validity regresses, security weakens, or latency/timeouts exceed budget without a large success-rate gain.
9. Write a short benchmark/report note for every kept change.

## Commands

Use these repo commands first:

```powershell
pnpm compile
pnpm test:e2e
pnpm test
```

Add a benchmark script once the harness exists:

```json
{
  "scripts": {
    "benchmark:web": "tsx benchmarks/web-control-plane/run.ts"
  }
}
```

Then run:

```powershell
pnpm benchmark:web
```

Redirect long benchmark output to a log:

```powershell
pnpm benchmark:web *> benchmark.web.log
```

## Timing Budget

Do not use the upstream autoresearch 5-minute LM-training budget. Web-control experiments have different failure modes.

Use these budgets:

- contract test run: under 2 minutes
- local benchmark smoke suite: under 5 minutes
- full local benchmark suite: under 20 minutes
- real-browser extension benchmark: under 30 minutes
- optional external benchmark subset: under 90 minutes

Per task:

- default task timeout: 120 seconds
- hard timeout: 180 seconds
- MCP bridge request timeout should remain explicit and logged

If a run exceeds its budget, stop it, mark the result as `timeout`, and move on.

## Results File

Use tab-separated `results.web.tsv`:

```text
commit	suite	tasks	success_rate	strict_success_rate	json_valid_rate	selector_hit_rate	actions_per_success	p50_s	p95_s	timeout_rate	status	description
```

Status values:

- `baseline`
- `keep`
- `discard`
- `crash`
- `timeout`

Use `0.0` for unavailable numeric fields after a crash. Descriptions must be short and tab-free.

## Decision Rule

Constraints:

- no unauthenticated non-loopback bridge access
- no default public `run_javascript` MCP tool unless deliberately gated for development
- no benchmark assertion weakening
- no broad UI churn
- no npm/yarn

Keep a change when:

- `task_success_rate` improves by at least one task on the frozen suite, or
- success is equal and one of `json_valid_rate`, `selector_hit_rate`, `actions_per_success`, or timeout behavior improves meaningfully.

Discard a change when:

- task success drops
- JSON validity drops for observe/extract tasks
- sidecar auth/origin safety weakens
- the change only improves one known task by overfitting evaluator text
- latency/timeouts regress beyond the timing budget with no success-rate gain

## Using `../autoresearch-win-rtx`

Use the sibling repo as a playbook, not as a dependency.

Useful ideas to borrow:

- the `program.md` loop structure
- frozen benchmark discipline
- `results.tsv` progress tracking
- benchmark report format
- explicit keep/discard rules

Do not copy its RAG service objective into Gemma Gem. Gemma Gem's objective is browser control-plane reliability.

If later model fine-tuning becomes justified, use autoresearch-style infrastructure to train a small control-plane reranker or policy model from Gemma Gem traces. Candidate data:

- page brief
- task instruction
- observed candidate actions
- selected action
- tool result
- success/failure label

Possible first trainable component:

- an action/selector reranker that chooses among observed candidates before calling `gemma_act`

This should only happen after there are enough benchmark traces to evaluate it.

## End-of-Run Deliverables

When interrupted or asked for a report, produce:

1. `benchmarks/web-control-plane/report.md`: baseline vs best control plane, including task success, strict success, JSON validity, selector hit rate, task latency, timeouts, and notable failures.
2. `results.web.tsv`: full experiment ledger.
3. A short list of kept changes and reverted/discarded hypotheses.
4. Current recommended command to run the suite.
5. Next three highest-value experiments.

The end state should be a Gemma Gem control plane that can repeatedly run measurable browser tasks, not just a set of plausible prompts.
