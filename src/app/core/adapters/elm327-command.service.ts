import { Injectable } from '@angular/core';

const TIMEOUT_MS = 3000;
const BLE_MTU = 20;

// Structural types for Web Bluetooth characteristics (avoids @types/web-bluetooth)
export interface BleWriteCharacteristic extends EventTarget {
  writeValue(data: BufferSource): Promise<void>;
}

export interface BleNotifyCharacteristic extends EventTarget {
  value: DataView | null;
  startNotifications(): Promise<BleNotifyCharacteristic>;
}

/**
 * Serial command queue for ELM327 over BLE.
 *
 * Rules:
 *  - Only one command in flight at a time; callers await naturally via the queue.
 *  - Commands are UTF-8 encoded and appended with \r before writing.
 *  - Writes are chunked to BLE_MTU (20) bytes to respect BLE MTU limits.
 *  - Resolution waits for the '>' prompt that signals ELM327 is idle again.
 *  - A 3-second timeout rejects the command if no prompt is received.
 */
@Injectable({ providedIn: 'root' })
export class Elm327CommandService {
  private txChar: BleWriteCharacteristic | null = null;
  private rxChar: BleNotifyCharacteristic | null = null;
  private rxBuffer = '';
  private pendingResolve: ((response: string) => void) | null = null;
  private pendingReject: ((err: Error) => void) | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private attached = false;

  /** Wire up BLE characteristics. Resets queue and buffer. */
  attach(tx: BleWriteCharacteristic, rx: BleNotifyCharacteristic): void {
    this.txChar = tx;
    this.rxChar = rx;
    this.attached = true;
    this.rxBuffer = '';
    this.queue = Promise.resolve();
    rx.addEventListener('characteristicvaluechanged', this.onRxData);
  }

  /** Release BLE characteristics and reject any in-flight command. */
  detach(): void {
    this.attached = false;
    this.rxChar?.removeEventListener('characteristicvaluechanged', this.onRxData);
    const reject = this.pendingReject;
    this.pendingResolve = null;
    this.pendingReject = null;
    this.clearPendingTimer();
    this.txChar = null;
    this.rxChar = null;
    this.rxBuffer = '';
    this.queue = Promise.resolve();
    reject?.(new Error('BLE disconnected'));
  }

  /**
   * Enqueue a command and resolve with the cleaned ELM327 response.
   * Rejects if not attached, if detach() is called mid-flight, or on timeout.
   */
  send(command: string): Promise<string> {
    const result = this.queue.then(() => this.execute(command));
    this.queue = result.then(
      () => void 0,
      () => void 0
    );
    return result;
  }

  private async execute(command: string): Promise<string> {
    if (!this.attached || !this.txChar) {
      throw new Error(`Cannot send "${command}": not attached to BLE device`);
    }

    this.rxBuffer = '';

    const responsePromise = new Promise<string>((resolve, reject) => {
      this.pendingTimer = setTimeout(() => {
        this.pendingResolve = null;
        this.pendingReject = null;
        this.pendingTimer = null;
        reject(new Error(`ELM327 timeout waiting for response to: ${command}`));
      }, TIMEOUT_MS);

      this.pendingResolve = (response: string) => {
        this.clearPendingTimer();
        this.pendingResolve = null;
        this.pendingReject = null;
        resolve(response);
      };

      this.pendingReject = (err: Error) => {
        this.clearPendingTimer();
        this.pendingResolve = null;
        this.pendingReject = null;
        reject(err);
      };
    });

    const bytes = new TextEncoder().encode(command + '\r');
    try {
      for (let offset = 0; offset < bytes.length; offset += BLE_MTU) {
        if (!this.attached || !this.txChar) {
          throw new Error(`Detached while sending "${command}"`);
        }
        await this.txChar.writeValue(bytes.slice(offset, offset + BLE_MTU));
      }

      if (!this.attached) {
        throw new Error(`Detached after sending "${command}"`);
      }
    } catch (err) {
      this.pendingReject?.(err instanceof Error ? err : new Error(String(err)));
    }

    return responsePromise;
  }

  // Arrow function preserves `this` when used as an EventTarget listener
  private onRxData = (event: Event): void => {
    const char = event.target as BleNotifyCharacteristic;
    if (!char?.value) return;

    this.rxBuffer += new TextDecoder().decode(char.value);

    if (!this.rxBuffer.includes('>')) return;

    const firstPrompt = this.rxBuffer.indexOf('>');
    const lastPrompt = this.rxBuffer.lastIndexOf('>');
    const responseBuffer = this.rxBuffer.slice(0, firstPrompt);
    this.rxBuffer = this.rxBuffer.slice(lastPrompt + 1);

    // Strip prompt, normalise line endings, collapse blank lines
    const response = responseBuffer
      .replace(/>/g, '')
      .replace(/\r\n|\r/g, '\n')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .join('\n');

    this.pendingResolve?.(response);
  };

  private clearPendingTimer(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
  }
}
