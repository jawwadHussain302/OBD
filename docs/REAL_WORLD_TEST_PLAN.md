# Real-World Test Plan

Use this checklist before and during real vehicle testing. Record the browser, adapter, vehicle, VIN availability, and any screenshots or console errors for each run.

## 1. Browser And Platform

- Chrome desktop: verify Web Bluetooth adapter selection opens.
- Edge desktop: verify Web Bluetooth adapter selection opens.
- Android Chrome: verify adapter selection, connection, and live data display.
- iOS/iPadOS: confirm the app shows the unsupported Web Bluetooth message.

## 2. OBD Connection

- Connect a powered ELM327 adapter.
- Disconnect the adapter during polling and confirm the UI clears stale values.
- Reconnect after a disconnect and confirm live data resumes.
- Try an unsupported or incompatible adapter and confirm a clear connection error appears.

## 3. Vehicle Setup

- VIN available: confirm VIN lookup attempts local, exact Firestore, then VIN pattern.
- VIN unavailable: confirm manual setup remains available.
- Manual setup: save make, model, fuel type, optional year, engine, and protocol.
- Firestore vehicle profile reuse: repeat the same VIN and confirm a saved profile auto-loads when backend auth allows writes.
- Backend write limitation: if anonymous auth is not configured, confirm the UI says the profile was saved locally and cloud learning is pending.

## 4. DTC Workflow

- Known DTC: confirm local bundled definition is used.
- Unknown DTC: confirm Firebase lookup is attempted.
- AI fallback: confirm unknown codes receive a structured definition when the backend succeeds.
- Cached reuse: scan the same unknown DTC again and confirm the Firestore definition is reused.
- Backend failure: confirm the UI shows `Unknown DTC - AI lookup unavailable`.

## 5. Live Data

- RPM displays with RPM units.
- Coolant temperature displays with temperature units.
- Battery voltage displays where supported.
- Fuel trims display percent units.
- O2 sensors display volts after normalization.
- Unsupported PIDs show a friendly no-data or unsupported message.

## 6. Catalytic Converter Test

- Stable downstream sensor: confirm status trends normal.
- Downstream mirrors upstream: confirm high sensor matching and degraded status.
- Missing B1S1: confirm a clear upstream sensor missing message.
- Missing B1S2: confirm B1S1 still graphs and comparison limitation is explained.
- Millivolt values: confirm values above 5 and up to 5000 are divided by 1000 before graphing and analysis.
- Volt values: confirm values from 0 to 5 remain unchanged.
- Mixed units: confirm the graph y-axis remains `Voltage (V)` and no false failure appears from unit mismatch.

## 7. Guided Diagnosis

- Run and complete `no-start`.
- Run and complete `misfire`.
- Run and complete `rough-idle`.
- Run and complete `lack-of-power`.
- Run and complete `high-fuel-consumption`.
- Run and complete `overheating`.
- Run and complete `battery-charging`.
- Run and complete `dpf-egr`.
- Run and complete `ev-reduced-power`.
- Open an invalid guided route and confirm `Diagnostic test not found.` appears.

## 8. Sessions

- Save a completed diagnostic session.
- Save a second session for the same vehicle and compare them.
- Confirm fixed, still present, new, improved, worsened, and unchanged findings render when present.
- Select sessions from different VINs and confirm `Please select two sessions from the same vehicle.` appears.

## 9. AI Backend

- Successful AI diagnosis: confirm schema-valid response appears in the report.
- AI fallback: disable or block the backend and confirm deterministic fallback copy appears.
- Quota/failure behavior: confirm quota exhaustion or backend failure does not block the rest of the diagnosis workflow.
