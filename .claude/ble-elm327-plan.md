# BLE ELM327 Web Bluetooth Adapter — Implementation Plan

## Context

The existing `ObdAdapter` interface is already hardware-agnostic.  
`MockObdAdapterService` will not be touched.  
The plan is to add a `WebBluetoothElm327AdapterService` that satisfies the same contract.

---

## 1. Architecture Fit

The `ObdAdapter` interface already defines everything needed:

```
data$:             Observable<ObdLiveFrame>
connectionStatus$: Observable<'disconnected' | 'connecting' | 'connected' | 'error'>
connect():         Promise<void>
disconnect():      Promise<void>
sendCommand():     Promise<string>
```

`WebBluetoothElm327AdapterService` implements this interface exactly.  
No changes to the interface, the dashboard, or the diagnostic engine.

---

## 2. Files to Add (Implementation Phase Only)

```
src/app/core/adapters/
  web-bluetooth-elm327-adapter.service.ts   ← implements ObdAdapter
  elm327-command.service.ts                 ← queues/sends AT commands over BLE
  obd-pid-parser.service.ts                 ← hex → engineering unit converters
```

No existing files are modified.

---

## 3. BLE Hardware Constraint — Critical

Web Bluetooth supports **BLE/GATT only**.

| Adapter type              | Works? |
|---------------------------|--------|
| BLE OBD2 (e.g. Viecar, VEEPEAK BLE) | ✅ |
| Bluetooth Classic ELM327 (most cheap adapters) | ❌ |
| Wi-Fi ELM327              | ❌ |
| USB ELM327                | ❌ |

Cheap adapters sold as "Bluetooth OBD2" are almost always **Bluetooth Classic**, not BLE.  
The user must have a confirmed BLE adapter before testing.

---

## 4. Required Browser Environment

- Chrome 56+ or Edge 79+ (desktop)
- HTTPS or `localhost` (insecure origins blocked by the browser)
- User gesture required to trigger `requestDevice` (must be called from a button click)
- iOS: Web Bluetooth is **not supported** in Safari or Chrome on iOS (WebKit limitation)
- Android Chrome: supported on most modern devices

---

## 5. BLE GATT Profile for Serial-Style OBD Adapters

Most BLE OBD adapters emulate a UART-over-BLE profile. Two common variants:

### Variant A — Generic BLE Serial (most common)
```
Service UUID:         0000fff0-0000-1000-8000-00805f9b34fb
TX (write) char:      0000fff2-0000-1000-8000-00805f9b34fb
RX (notify) char:     0000fff1-0000-1000-8000-00805f9b34fb
```

### Variant B — Nordic UART Service (NUS)
```
Service UUID:         6e400001-b5a3-f393-e0a9-e50e24dcca9e
TX (write) char:      6e400002-b5a3-f393-e0a9-e50e24dcca9e
RX (notify) char:     6e400003-b5a3-f393-e0a9-e50e24dcca9e
```

The adapter service should try Variant A first, fall back to Variant B.  
The actual UUIDs should be configurable or auto-detected.

---

## 6. Connection Flow

```
1. navigator.bluetooth.requestDevice({
     filters: [{ services: [SERVICE_UUID] }]
     — or —
     acceptAllDevices: true, optionalServices: [SERVICE_UUID_A, SERVICE_UUID_B]
   })

2. device.gatt.connect()
   → BluetoothRemoteGATTServer

3. server.getPrimaryService(SERVICE_UUID)
   → BluetoothRemoteGATTService

4. service.getCharacteristic(TX_CHAR_UUID)  ← write commands here
5. service.getCharacteristic(RX_CHAR_UUID)  ← subscribe to notifications here

6. rxChar.startNotifications()
   rxChar.addEventListener('characteristicvaluechanged', handler)

7. Run ELM327 init sequence (see §7)

8. Start PID polling loop (see §8)
```

On failure at any step → emit `'error'` on `connectionStatus$`.

---

## 7. ELM327 Initialization Sequence

Send these commands in order, wait for `OK` or `>` response after each:

| Command | Purpose |
|---------|---------|
| `ATZ`   | Reset ELM327 |
| `ATE0`  | Echo off — prevents doubled input in response |
| `ATL0`  | Linefeeds off |
| `ATS0`  | Spaces off — cleaner hex parsing |
| `ATH0`  | Headers off — removes address bytes from response |
| `ATSP0` | Auto-detect OBD protocol |

After `ATZ`, wait ~1 second (chip reboots).  
After `ATSP0`, send `0100` (supported PIDs) to verify the vehicle is communicating.

---

## 8. PID Polling Loop

After init, poll PIDs in a round-robin loop with ~100–200ms between commands:

| PID    | Field          | Parse formula                        |
|--------|----------------|--------------------------------------|
| `010C` | rpm            | `((A * 256) + B) / 4`               |
| `010D` | speed          | `A` (km/h)                           |
| `0105` | coolantTemp    | `A - 40` (°C)                        |
| `0104` | engineLoad     | `(A * 100) / 255` (%)               |
| `0106` | stftB1         | `(A - 128) * 100 / 128` (%)         |
| `0107` | ltftB1         | `(A - 128) * 100 / 128` (%)         |

`intakeAirTemp` (010F), `throttlePosition` (0111), `batteryVoltage` (ATRV) can be added later.

Assemble a complete `ObdLiveFrame` once all required PIDs have been collected for one cycle, then emit on `data$`.

---

## 9. sendCommand() Design

`sendCommand(command: string): Promise<string>` must:

1. Encode the command as UTF-8 bytes + `\r` terminator
2. Write to TX characteristic (may need to chunk to ≤20 bytes for BLE MTU)
3. Wait for RX notifications to accumulate until response ends with `>`
4. Decode bytes → string
5. Strip echo, `\r`, `\n`, spaces
6. Resolve with clean response string
7. Reject (or timeout) after ~3 seconds if no `>` received

**Only one command in flight at a time.** Use a serial command queue (`elm327-command.service.ts`).

---

## 10. Parser Design (`obd-pid-parser.service.ts`)

```
Input:  raw string response, e.g. "41 0C 1A F8"
Step 1: Split on spaces → ["41", "0C", "1A", "F8"]
Step 2: Drop mode/PID echo bytes (first two: "41", "0C")
Step 3: Parse remaining as hex → [0x1A, 0xF8]  →  [26, 248]
Step 4: Apply formula → ((26 * 256) + 248) / 4  =  1726 rpm
```

Errors / "NO DATA" / "UNABLE TO CONNECT" responses are caught, logged, and that PID is skipped for that cycle.

---

## 11. Adapter Switching (Dashboard Integration)

The dashboard currently injects `MockObdAdapterService` directly.  
When it is time to switch, the correct pattern is:

```typescript
// app.config.ts or a feature provider
{ provide: ObdAdapter, useClass: WebBluetoothElm327AdapterService }
// or for mock:
{ provide: ObdAdapter, useClass: MockObdAdapterService }
```

The dashboard component changes its injection token from `MockObdAdapterService` to `ObdAdapter`.  
This is a **one-line change** in the dashboard constructor — everything else stays the same.

A later UI improvement could add a settings page to let the user choose the adapter at runtime via a factory or a toggle in the provider.

---

## 12. Risks and Unknowns

| Risk | Severity | Notes |
|------|----------|-------|
| User's ELM327 is Bluetooth Classic, not BLE | **High** | Must verify adapter spec before testing. Browser will silently find nothing. |
| BLE service UUID varies by adapter brand | **High** | May need to test multiple UUIDs or add a UUID picker in the UI |
| BLE MTU limits write size to 20 bytes | Medium | Commands are short, but chunking logic still needed |
| `requestDevice()` requires user gesture | Medium | Cannot auto-connect on page load — needs a "Connect" button |
| iOS not supported | Medium | Web Bluetooth blocked by WebKit; no workaround without a native app |
| ELM327 clones have inconsistent firmware | Medium | Some ignore `ATE0`, some return garbled responses on `ATZ` |
| PID polling latency over BLE | Low | ~1 frame/sec is achievable; real-time feel may be limited |
| HTTPS required in production | Low | `localhost` is exempt — fine for development |

---

## 13. Implementation Order (When Ready)

1. `obd-pid-parser.service.ts` — pure functions, testable without hardware
2. `elm327-command.service.ts` — queue + send + await response logic
3. `WebBluetoothElm327AdapterService` — wires BLE APIs to the command service
4. Dashboard: change injection token from `MockObdAdapterService` → `ObdAdapter`
5. Add a "Connect Hardware" button to the dashboard or vehicle profile page
6. Test on a confirmed BLE adapter (Viecar 4.0, VEEPEAK BLE, or similar)
