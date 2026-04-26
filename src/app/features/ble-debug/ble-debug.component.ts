import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Minimal Web Bluetooth type declarations (avoids @types/web-bluetooth dependency)
interface BleCharacteristic extends EventTarget {
  value: DataView | null;
  writeValue(data: BufferSource): Promise<void>;
  startNotifications(): Promise<BleCharacteristic>;
}
interface BleService {
  getCharacteristic(uuid: string): Promise<BleCharacteristic>;
}
interface BleGattServer {
  connect(): Promise<BleGattServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BleService>;
}
interface BleDevice {
  name?: string;
  gatt?: BleGattServer;
}
interface BluetoothApi {
  requestDevice(options: { acceptAllDevices?: boolean; optionalServices?: string[] }): Promise<BleDevice>;
}

// Generic BLE Serial profile (most common OBD adapters)
const SERVICE_A = '0000fff0-0000-1000-8000-00805f9b34fb';
const TX_A      = '0000fff2-0000-1000-8000-00805f9b34fb';
const RX_A      = '0000fff1-0000-1000-8000-00805f9b34fb';

// Nordic UART Service fallback
const SERVICE_NUS = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const TX_NUS      = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const RX_NUS      = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

export type BleStatus = 'idle' | 'connecting' | 'connected' | 'error';

@Component({
  selector: 'app-ble-debug',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ble-debug.component.html',
  styleUrls: ['./ble-debug.component.scss']
})
export class BleDebugComponent implements OnDestroy {
  public status: BleStatus = 'idle';
  public log: string[] = [];
  public command = '';
  public isSending = false;

  @ViewChild('logContainer') private logContainer?: ElementRef<HTMLDivElement>;

  private txChar: BleCharacteristic | null = null;
  private rxChar: BleCharacteristic | null = null;
  private gattServer: BleGattServer | null = null;

  public get canConnect(): boolean {
    return this.status === 'idle' || this.status === 'error';
  }

  public get canSend(): boolean {
    return this.status === 'connected' && !this.isSending && this.command.trim().length > 0;
  }

  public async connectDevice(): Promise<void> {
    const bluetooth = (navigator as unknown as { bluetooth?: BluetoothApi }).bluetooth;
    if (!bluetooth) {
      this.appendLog('!! Web Bluetooth is not available. Use Chrome or Edge on localhost/HTTPS.');
      this.status = 'error';
      return;
    }

    this.status = 'connecting';
    this.appendLog('>> Requesting BLE device...');

    try {
      const device = await bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_A, SERVICE_NUS]
      });

      this.appendLog(`>> Device selected: ${device.name ?? '(unnamed)'}`);

      if (!device.gatt) {
        throw new Error('GATT server not available on this device.');
      }

      const server = await device.gatt.connect();
      this.gattServer = server;
      this.appendLog('>> GATT connected');

      this.txChar = await this.resolveCharacteristics(server);
      this.status = 'connected';
      this.appendLog('>> Ready. Send ATZ to reset, then ATE0/ATL0/ATS0/ATH0/ATSP0 to init.');
    } catch (err) {
      this.status = 'error';
      this.appendLog(`!! ${String(err)}`);
    }
  }

  private async resolveCharacteristics(server: BleGattServer): Promise<BleCharacteristic> {
    // Try Generic BLE Serial (FFF0) first
    try {
      const service = await server.getPrimaryService(SERVICE_A);
      const rx = await service.getCharacteristic(RX_A);
      const tx = await service.getCharacteristic(TX_A);
      await rx.startNotifications();
      rx.addEventListener('characteristicvaluechanged', this.onRxData);
      this.rxChar = rx;
      this.appendLog('>> Profile: Generic BLE Serial (FFF0/FFF1/FFF2)');
      return tx;
    } catch {
      this.appendLog('>> FFF0 service not found, trying Nordic UART...');
    }

    // Fallback to Nordic UART Service (6E40)
    const service = await server.getPrimaryService(SERVICE_NUS);
    const rx = await service.getCharacteristic(RX_NUS);
    const tx = await service.getCharacteristic(TX_NUS);
    await rx.startNotifications();
    rx.addEventListener('characteristicvaluechanged', this.onRxData);
    this.rxChar = rx;
    this.appendLog('>> Profile: Nordic UART Service (6E40/RX/TX)');
    return tx;
  }

  public async sendCommand(): Promise<void> {
    if (!this.canSend || !this.txChar) return;

    const cmd = this.command.trim();
    this.command = '';
    this.isSending = true;
    this.appendLog(`<< ${cmd}`);

    try {
      const bytes = new TextEncoder().encode(cmd + '\r');
      await this.txChar.writeValue(bytes);
    } catch (err) {
      this.appendLog(`!! Send error: ${String(err)}`);
    } finally {
      this.isSending = false;
    }
  }

  public onCommandKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.sendCommand();
    }
  }

  public clearLog(): void {
    this.log = [];
  }

  // Arrow function preserves `this` when used as an event listener
  private onRxData = (event: Event): void => {
    const char = event.target as BleCharacteristic;
    if (!char?.value) return;
    const text = new TextDecoder().decode(char.value).replace(/\r?\n$/, '').trim();
    if (text) {
      this.appendLog(`>> ${text}`);
    }
  };

  private appendLog(line: string): void {
    this.log.push(line);
    // Scroll to bottom after Angular renders the new entry
    setTimeout(() => {
      const el = this.logContainer?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }

  public ngOnDestroy(): void {
    this.rxChar?.removeEventListener('characteristicvaluechanged', this.onRxData);
    this.gattServer?.disconnect();
    this.rxChar = null;
    this.txChar = null;
    this.gattServer = null;
  }
}
