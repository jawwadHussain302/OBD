# OBD2 Diagnostic Dashboard

Angular 19 SPA — standalone components, strict TypeScript. Active branch: **main**.

## Rules
- Standalone components only — no NgModules.
- Keep `.ts`, `.html`, and `.scss` in separate files. No inline templates or styles.
- Use the `ObdAdapter` injection token; never inject `MockObdAdapterService` directly in hardware-ready code.
- Append `\r` to every ELM327 command. Only one command in flight at a time.

## What's Built
- Mock adapter streaming synthetic OBD frames (5 fault modes)
- Diagnostic engine: 30-frame buffer, 6 rules, 3-frame debounce
- Dashboard: 6 metric cards, 3 live charts, diagnostic alert panel

## Next Work
BLE ELM327 debug console + `WebBluetoothElm327Adapter`. See `.Codex/ble-elm327-plan.md`.

## Key References
- `.Codex/ARCHITECTURE_MAP.md` — module layout
- `.Codex/COMMON_MISTAKES.md` — known pitfalls
- `.Codex/QUICK_START.md` — dev commands
- `.Codex/ble-elm327-plan.md` — BLE implementation plan

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
