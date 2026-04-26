import { TestBed, fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import {
  Elm327CommandService,
  BleWriteCharacteristic,
  BleNotifyCharacteristic,
} from './elm327-command.service';

// ---------------------------------------------------------------------------
// Fake BLE characteristics
// ---------------------------------------------------------------------------

class FakeTxChar extends EventTarget implements BleWriteCharacteristic {
  readonly writes: Uint8Array[] = [];

  writeValue(data: BufferSource): Promise<void> {
    if (data instanceof ArrayBuffer) {
      this.writes.push(new Uint8Array(data));
    } else {
      const view = data as ArrayBufferView;
      this.writes.push(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    }
    return Promise.resolve();
  }
}

class FakeRxChar extends EventTarget implements BleNotifyCharacteristic {
  value: DataView | null = null;

  startNotifications(): Promise<this> {
    return Promise.resolve(this);
  }

  /** Simulate an incoming BLE notification containing `text`. */
  emit(text: string): void {
    const buf = new TextEncoder().encode(text);
    this.value = new DataView(buf.buffer, 0, buf.byteLength);
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decodedWrites(tx: FakeTxChar): string[] {
  return tx.writes.map(b => new TextDecoder().decode(b));
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Elm327CommandService', () => {
  let service: Elm327CommandService;
  let tx: FakeTxChar;
  let rx: FakeRxChar;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Elm327CommandService);
    tx = new FakeTxChar();
    rx = new FakeRxChar();
  });

  // -------------------------------------------------------------------------
  // Basic send / resolve
  // -------------------------------------------------------------------------

  it('resolves with cleaned response when prompt arrives', fakeAsync(() => {
    service.attach(tx, rx);

    let result: string | undefined;
    service.send('ATZ').then(r => (result = r));

    flushMicrotasks(); // execute() runs, writeValue awaited
    flushMicrotasks(); // writeValue resolves, pendingResolve set

    rx.emit('ELM327 v2.1\r\r>');

    flushMicrotasks();

    expect(result).toBe('ELM327 v2.1');
  }));

  it('strips the > prompt from the response', fakeAsync(() => {
    service.attach(tx, rx);

    let result: string | undefined;
    service.send('ATE0').then(r => (result = r));
    flushMicrotasks();
    flushMicrotasks();

    rx.emit('OK\r\r>');
    flushMicrotasks();

    expect(result).toBe('OK');
  }));

  it('returns multi-line responses joined with newline', fakeAsync(() => {
    service.attach(tx, rx);

    let result: string | undefined;
    service.send('03').then(r => (result = r));
    flushMicrotasks();
    flushMicrotasks();

    rx.emit('43 01 33 00 00 00 00\r\r>');
    flushMicrotasks();

    expect(result).toBe('43 01 33 00 00 00 00');
  }));

  // -------------------------------------------------------------------------
  // TX write encoding
  // -------------------------------------------------------------------------

  it('appends \\r to the command before writing', fakeAsync(() => {
    service.attach(tx, rx);

    service.send('ATZ');
    flushMicrotasks();
    flushMicrotasks();

    expect(decodedWrites(tx)).toEqual(['ATZ\r']);
  }));

  it('writes a short command as a single BLE chunk', fakeAsync(() => {
    service.attach(tx, rx);

    service.send('010C');
    flushMicrotasks();
    flushMicrotasks();

    expect(tx.writes.length).toBe(1);
  }));

  it('splits a command longer than 20 bytes into multiple chunks', fakeAsync(() => {
    service.attach(tx, rx);

    // 21 chars + '\r' = 22 bytes → two chunks (20 + 2)
    const longCmd = 'A'.repeat(21);
    service.send(longCmd);
    flushMicrotasks();
    flushMicrotasks();
    flushMicrotasks(); // second chunk awaited

    expect(tx.writes.length).toBe(2);
    expect(tx.writes[0].byteLength).toBe(20);
    expect(tx.writes[1].byteLength).toBe(2);
  }));

  // -------------------------------------------------------------------------
  // Multi-chunk RX accumulation
  // -------------------------------------------------------------------------

  it('accumulates RX chunks until > is seen', fakeAsync(() => {
    service.attach(tx, rx);

    let result: string | undefined;
    service.send('03').then(r => (result = r));
    flushMicrotasks();
    flushMicrotasks();

    // Arrives in two separate BLE notifications
    rx.emit('43 01 33');
    expect(result).toBeUndefined(); // no prompt yet

    rx.emit(' 00 00 00 00\r\r>');
    flushMicrotasks();

    expect(result).toBe('43 01 33 00 00 00 00');
  }));

  // -------------------------------------------------------------------------
  // Timeout
  // -------------------------------------------------------------------------

  it('rejects with a timeout error if no prompt arrives within 3 s', fakeAsync(() => {
    service.attach(tx, rx);

    let err: Error | undefined;
    service.send('ATZ').catch(e => (err = e));
    flushMicrotasks();
    flushMicrotasks();

    tick(3000);
    flushMicrotasks();

    expect(err?.message).toContain('timeout');
    expect(err?.message).toContain('ATZ');
  }));

  it('does not reject before the timeout expires', fakeAsync(() => {
    service.attach(tx, rx);

    let rejected = false;
    service.send('ATZ').catch(() => (rejected = true));
    flushMicrotasks();
    flushMicrotasks();

    tick(2999);
    flushMicrotasks();

    expect(rejected).toBeFalse();
    tick(1); // drain remaining
  }));

  // -------------------------------------------------------------------------
  // Not attached
  // -------------------------------------------------------------------------

  it('rejects immediately if send() is called before attach()', fakeAsync(() => {
    let err: Error | undefined;
    service.send('ATZ').catch(e => (err = e));
    flushMicrotasks();

    expect(err?.message).toContain('not attached');
  }));

  // -------------------------------------------------------------------------
  // Serial queue
  // -------------------------------------------------------------------------

  it('queues commands and executes them in order', fakeAsync(() => {
    service.attach(tx, rx);

    const results: string[] = [];
    service.send('ATZ').then(r => results.push(r));
    service.send('ATE0').then(r => results.push(r));

    // Flush until first command is in flight
    flushMicrotasks();
    flushMicrotasks();

    // Only ATZ should have been written so far
    expect(decodedWrites(tx)).toEqual(['ATZ\r']);

    // Resolve first command
    rx.emit('ELM327 v2.1\r\r>');
    flushMicrotasks(); // resolves ATZ, unblocks queue
    flushMicrotasks(); // execute('ATE0') runs
    flushMicrotasks(); // writeValue for ATE0 resolves, pendingResolve set

    // ATE0 should now be written
    expect(decodedWrites(tx)).toEqual(['ATZ\r', 'ATE0\r']);

    // Resolve second command
    rx.emit('OK\r\r>');
    flushMicrotasks();

    expect(results).toEqual(['ELM327 v2.1', 'OK']);
  }));

  it('second command does not start until first resolves', fakeAsync(() => {
    service.attach(tx, rx);

    service.send('ATZ');
    service.send('ATE0');

    flushMicrotasks();
    flushMicrotasks();

    // First command written, second not yet
    expect(tx.writes.length).toBe(1);

    tick(3000); // let first command time out
    flushMicrotasks();
    flushMicrotasks();
    flushMicrotasks();

    // Second command now written after queue unblocks on timeout rejection
    expect(tx.writes.length).toBe(2);

    tick(3000); // drain second timeout
  }));

  // -------------------------------------------------------------------------
  // detach()
  // -------------------------------------------------------------------------

  it('detach() rejects the in-flight command', fakeAsync(() => {
    service.attach(tx, rx);

    let err: Error | undefined;
    service.send('ATZ').catch(e => (err = e));
    flushMicrotasks();
    flushMicrotasks();

    service.detach();
    flushMicrotasks();

    expect(err?.message).toContain('disconnected');
  }));

  it('detach() stops RX data from being processed', fakeAsync(() => {
    service.attach(tx, rx);

    let resolved = false;
    service.send('ATZ').then(() => (resolved = true)).catch(() => {});
    flushMicrotasks();
    flushMicrotasks();

    service.detach();
    rx.emit('ELM327 v2.1\r\r>'); // notification after detach
    flushMicrotasks();

    expect(resolved).toBeFalse();
  }));

  it('allows re-attach and send after detach', fakeAsync(() => {
    service.attach(tx, rx);
    service.detach();

    const tx2 = new FakeTxChar();
    const rx2 = new FakeRxChar();
    service.attach(tx2, rx2);

    let result: string | undefined;
    service.send('ATZ').then(r => (result = r));
    flushMicrotasks();
    flushMicrotasks();

    rx2.emit('ELM327 v2.1\r\r>');
    flushMicrotasks();

    expect(result).toBe('ELM327 v2.1');
    expect(tx2.writes.length).toBe(1);
  }));

  // -------------------------------------------------------------------------
  // Response edge cases
  // -------------------------------------------------------------------------

  it('handles response that is only the prompt character', fakeAsync(() => {
    service.attach(tx, rx);

    let result: string | undefined;
    service.send('ATE0').then(r => (result = r));
    flushMicrotasks();
    flushMicrotasks();

    rx.emit('>');
    flushMicrotasks();

    expect(result).toBe('');
  }));

  it('handles NO DATA error token in response', fakeAsync(() => {
    service.attach(tx, rx);

    let result: string | undefined;
    service.send('010C').then(r => (result = r));
    flushMicrotasks();
    flushMicrotasks();

    rx.emit('NO DATA\r\r>');
    flushMicrotasks();

    expect(result).toBe('NO DATA');
  }));
});
