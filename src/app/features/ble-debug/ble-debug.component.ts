import { Component, ElementRef, OnDestroy, ViewChild, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ObdAdapter, OBD_ADAPTER } from '../../core/adapters/obd-adapter.interface';
import { Subscription } from 'rxjs';

export type BleStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

@Component({
  selector: 'app-ble-debug',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ble-debug.component.html',
  styleUrls: ['./ble-debug.component.scss']
})
export class BleDebugComponent implements OnDestroy {
  public status: BleStatus = 'disconnected';
  public log: string[] = [];
  public command = '';
  public isSending = false;

  @ViewChild('logContainer') private logContainer?: ElementRef<HTMLDivElement>;
  private subscription = new Subscription();

  constructor(@Inject(OBD_ADAPTER) private obdAdapter: ObdAdapter) {
    this.subscription.add(
      this.obdAdapter.connectionStatus$.subscribe(s => {
        this.status = s;
      })
    );
  }

  public get canConnect(): boolean {
    return this.status === 'disconnected' || this.status === 'error';
  }

  public get canSend(): boolean {
    return this.status === 'connected' && !this.isSending && this.command.trim().length > 0;
  }

  public async connectDevice(): Promise<void> {
    this.appendLog('>> Connecting via shared OBD adapter...');
    try {
      await this.obdAdapter.connect();
    } catch (err) {
      this.appendLog(`!! Connect error: ${String(err)}`);
    }
  }

  public async sendCommand(): Promise<void> {
    if (!this.canSend) return;

    const cmd = this.command.trim();
    this.command = '';
    this.isSending = true;
    this.appendLog(`<< ${cmd}`);

    try {
      const response = await this.obdAdapter.sendCommand(cmd);
      this.appendLog(`>> ${response}`);
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
    this.subscription.unsubscribe();
  }
}
