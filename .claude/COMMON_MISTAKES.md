# Common Mistakes

1. **Inject via token, not concrete class.** Use the `ObdAdapter` injection token. Do not inject `MockObdAdapterService` directly in hardware-ready components or services.

2. **Keep files separate.** Never compress `.ts`, `.html`, and `.scss` into a single file or one-liners. Each component must have three separate files.

3. **`DiagnosticResult` field name.** The field is `recommendedNextStep`, not `recommendedSteps`.

4. **No `getValue()` on Observables.** Do not call `.getValue()` on `activeResults$` — it is an `Observable`, not a `BehaviorSubject`.

5. **Web Bluetooth is BLE only.** The Web Bluetooth API connects to BLE/GATT devices. It cannot connect to Bluetooth Classic ELM327 adapters.

6. **Terminate ELM327 commands with `\r`.** Every command string sent to the adapter must end with a carriage return (`\r`).

7. **One ELM327 command at a time.** Do not queue or interleave commands. Wait for a response (or timeout) before sending the next command.
