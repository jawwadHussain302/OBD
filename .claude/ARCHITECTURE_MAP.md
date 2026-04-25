# Architecture Map

```
src/app/
├── core/
│   ├── models/          # OBD frame, vehicle profile, diagnostic result types
│   ├── adapters/        # ObdAdapter interface (injection token)
│   │                    # MockObdAdapterService — synthetic frames, 5 fault modes
│   │                    # WebBluetoothElm327Adapter — (planned, see ble-elm327-plan.md)
│   └── diagnostics/     # DiagnosticEngine, 30-frame buffer, 6 rules, 3-frame debounce
│
└── features/
    ├── dashboard/       # Live dashboard: 6 metric cards, 3 line charts, alert panel
    └── ble-debug/       # (planned) Raw BLE command console / ELM327 terminal
```

## Key Files
| Path | Purpose |
|------|---------|
| `core/adapters/obd-adapter.ts` | `ObdAdapter` interface + injection token |
| `core/diagnostics/diagnostic-engine.service.ts` | Rolling buffer + rule evaluation |
| `features/dashboard/dashboard.component.*` | Main dashboard view |
| `.claude/ble-elm327-plan.md` | Full BLE adapter implementation plan (3 new files) |
