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
BLE ELM327 debug console + `WebBluetoothElm327Adapter`. See `.claude/ble-elm327-plan.md`.

## Key References
- `.claude/ARCHITECTURE_MAP.md` — module layout
- `.claude/COMMON_MISTAKES.md` — known pitfalls
- `.claude/QUICK_START.md` — dev commands
- `.claude/ble-elm327-plan.md` — BLE implementation plan
