# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # dev server → http://localhost:4200
npm run build      # production build → dist/
npm test           # Karma/Jasmine test runner (watch mode)
npx ng test --include="**/foo.spec.ts" --watch=false --browsers=ChromeHeadless  # single spec
```

Web Bluetooth requires Chrome/Edge on `localhost` or HTTPS — it will not work on plain HTTP.

## Hard rules

- **Standalone components only** — no NgModules anywhere.
- **Three files per component** — `.ts`, `.html`, `.scss` must stay separate; no inline templates or styles.
- **Inject via token** — use `OBD_ADAPTER` injection token; never inject `MockObdAdapterService` or `SimulatorObdAdapterService` directly in hardware-ready code.
- **ELM327 protocol** — append `\r` to every command; only one command in flight at a time (wait for response or timeout before sending the next).
- **`activeResults$` is an `Observable`** — do not call `.getValue()` on it; use `async` pipe or `subscribe`.
- **`DiagnosticResult` field** is `recommendedNextStep` (singular), not `recommendedSteps`.

## Architecture

### OBD adapter layer (`src/app/core/adapters/`)

`ObdAdapter` is an interface + `OBD_ADAPTER` injection token. Two concrete implementations:
- `SimulatorObdAdapterService` — synthetic frames, 5 fault modes, always available in dev.
- `WebBluetoothElm327AdapterService` — real BLE/GATT adapter; uses `elm327-command.service.ts` for raw AT/OBD command I/O and `obd-pid-parser.service.ts` for response decoding.
- `AdapterSwitcherService` — switches between the two at runtime and persists the choice.

### Diagnostic engine (`src/app/core/diagnostics/`)

Two independent systems share this directory:

**Live rule engine** (`diagnostic-engine.service.ts`): rolling 50-frame buffer, evaluates 6 `DiagnosticRule` implementations (battery, idle-stability, lean, rich, vacuum-leak, warmup) with a 3-frame persistence threshold before raising a result. Rules implement `DiagnosticRule` from `diagnostic-rule.interface.ts`.

**Guided pack engine** (same service, separate API): `startPack(pack)` initialises hypothesis scores from `KnowledgePack.hypotheses[].initialConfidence`; `applyAnswer(option)` applies `option.effect` deltas and advances `currentStepId` (or follows `option.next` for branching). State is emitted via `diagnosticState$`. Types live in `diagnostic-types.ts`.

**Deep diagnosis** (`deep-diagnosis.service.ts`): multi-step automated scan (DTC collection → correlation → severity scoring → recommendations → AI evidence). Emits `DeepDiagnosisState` on `state$`. This is what the Full Diagnosis flow uses.

**Cylinder analysis** (`cylinder-analysis.service.ts`): stateless service — call `analyse(dtcCodes, misfireCounters?)` to get a `CylinderAnalysisResult` from P030X DTCs without touching the engine or pack system.

### Knowledge packs (`src/app/core/diagnostics/packs/`)

Each pack file exports a `KnowledgePack` constant and is re-exported from `index.ts`. All packs use the same five named score deltas: `HEAVY=0.40`, `STRONG=0.35`, `MEDIUM=0.20`, `SLIGHT=0.15`, `REDUCE=-0.20`. Scores are not clamped by the engine — they can go negative.

Current packs: `no-start`, `misfire`, `rough-idle`, `lack-of-power`, `high-fuel-consumption`.

### AI backend (`functions/src/index.ts` + `src/app/core/ai/`)

Firebase Cloud Function `aiDiagnose` (us-central1, project `obd2-f5a03`): receives `{ evidence, context }`, builds the system prompt server-side, calls OpenRouter (`openai/gpt-4o-mini`), validates the JSON schema, and returns a structured `AiDiagnosisResponse`. The API key (`OPENROUTER_API_KEY`) is a Firebase secret — it never touches the browser.

Frontend side: `AiDiagnosisService` calls the Firebase function URL and exposes `insight$: Observable<AiInsight>`. `EvidenceBuilderService` maps `DeepDiagnosisState` → `AiEvidence`. `AiUsageTrackerService` gates calls (quota); failures fall back via `AiFallbackService` without incrementing the counter.

### Features / routing (`src/app/features/`)

| Route | Feature | Notes |
|-------|---------|-------|
| `/diagnosis-assistant` | Hub page | Mode selector; enables Cylinder Analysis inline panel |
| `/diagnosis-report` | Full Diagnosis | Legacy route kept for deep-link compatibility |
| `/guided-tests` | Guided Diagnosis | Legacy route kept; uses `DeepDiagnosisService` |
| `/dashboard` | Live Data | Requires `provideCharts(withDefaultRegisterables())` at route level |
| `/vehicle-profile` | Vehicle Setup | Default redirect |
| `/sessions`, `/session-replay` | History | — |
| `/ble-debug` | BLE console | Raw ELM327 terminal |

Sidebar active state for the diagnosis section is driven by a `NavigationEnd` signal in `AppComponent` (`diagnosisActive`) that covers all three diagnosis routes.

### Design system (`src/styles/_variables.scss`)

All SCSS uses `@use '../../../styles/variables' as *`. Key tokens: `$bg-primary/#131313`, `$bg-secondary/#1e1e1e`, `$color-success/#4caf50`, `$color-warning/#ff9800`, `$color-critical/#f44336`, `$color-info/#2196f3`. Spacing is 4px baseline (`$spacing-xs` through `$spacing-2xl`).

## MCP Tools: code-review-graph

**Use graph tools before Grep/Glob/Read** — faster and gives structural context (callers, dependents, test coverage).

| Tool | Use when |
|------|----------|
| `semantic_search_nodes` or `query_graph` | Exploring code instead of Grep |
| `get_impact_radius` | Understanding blast radius of a change |
| `detect_changes` + `get_review_context` | Code review |
| `query_graph` pattern="tests_for" | Checking test coverage |
| `get_architecture_overview` + `list_communities` | Architecture questions |

The graph auto-updates on file changes via hooks.
