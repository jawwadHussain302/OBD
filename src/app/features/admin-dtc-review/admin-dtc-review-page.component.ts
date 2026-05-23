import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DtcDefinition } from '../../core/diagnostics/dtc/dtc-definition.model';
import {
  DtcReviewQueueService,
  DtcReviewUpdatePayload,
} from '../../core/diagnostics/dtc/dtc-review-queue.service';

@Component({
  selector: 'app-admin-dtc-review-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-dtc-review-page.component.html',
  styleUrls: ['./admin-dtc-review-page.component.scss'],
})
export class AdminDtcReviewPageComponent {
  private readonly reviewQueue = inject(DtcReviewQueueService);

  loading = true;
  error = '';
  pending: DtcDefinition[] = [];
  savingCode: string | null = null;
  rejectionReasonByCode: Record<string, string> = {};

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  trackByCode(_index: number, item: DtcDefinition): string {
    return item.code;
  }

  async approve(item: DtcDefinition): Promise<void> {
    await this.submit(item, 'approve');
  }

  async reject(item: DtcDefinition): Promise<void> {
    const reason = this.rejectionReasonByCode[item.code]?.trim();
    await this.submit(item, 'reject', reason || 'Rejected by admin');
  }

  async needsResearch(item: DtcDefinition): Promise<void> {
    await this.submit(item, 'needs_research');
  }

  asTextarea(value: string[] | undefined): string {
    return Array.isArray(value) ? value.join('\n') : '';
  }

  parseTextarea(value: string): string[] {
    return value
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
  }

  private async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      this.pending = await this.reviewQueue.listPending();
    } catch {
      this.error = 'Unable to load DTC review queue. Please try again.';
      this.pending = [];
    } finally {
      this.loading = false;
    }
  }

  private buildUpdate(item: DtcDefinition): DtcReviewUpdatePayload {
    return {
      title: item.title,
      severity: item.severity,
      description: item.description,
      commonCauses: item.commonCauses ?? [],
      recommendedChecks: item.recommendedChecks ?? [],
      safeToDrive: item.safeToDrive,
    };
  }

  private async submit(item: DtcDefinition, action: 'approve' | 'reject' | 'needs_research', rejectionReason?: string): Promise<void> {
    this.savingCode = item.code;
    this.error = '';
    try {
      await this.reviewQueue.submitReview(item.code, action, this.buildUpdate(item), rejectionReason);
      this.pending = this.pending.filter(d => d.code !== item.code);
      delete this.rejectionReasonByCode[item.code];
    } catch {
      this.error = 'Unable to save review action. Please try again.';
    } finally {
      this.savingCode = null;
    }
  }
}