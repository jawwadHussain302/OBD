import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  VehicleProfileReviewItem,
  VehicleReviewQueueService,
  VehicleReviewUpdatePayload,
} from '../../core/vehicle/vehicle-review-queue.service';

@Component({
  selector: 'app-admin-vehicle-review-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-vehicle-review-page.component.html',
  styleUrls: ['./admin-vehicle-review-page.component.scss'],
})
export class AdminVehicleReviewPageComponent {
  private readonly reviewQueue = inject(VehicleReviewQueueService);

  loading = true;
  error = '';
  pending: VehicleProfileReviewItem[] = [];
  savingId: string | null = null;
  rejectionReasonById: Record<string, string> = {};

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  trackById(_index: number, item: VehicleProfileReviewItem): string {
    return item.id;
  }

  async approve(item: VehicleProfileReviewItem): Promise<void> {
    await this.submit(item, 'approve');
  }

  async reject(item: VehicleProfileReviewItem): Promise<void> {
    const reason = this.rejectionReasonById[item.id]?.trim();
    await this.submit(item, 'reject', reason || 'Rejected by admin');
  }

  async needsResearch(item: VehicleProfileReviewItem): Promise<void> {
    await this.submit(item, 'needs_research');
  }

  formatSupportedPids(value: string[] | undefined): string {
    return Array.isArray(value) && value.length > 0 ? value.join(', ') : 'N/A';
  }

  private async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      this.pending = await this.reviewQueue.listPending();
    } catch {
      this.error = 'Unable to load vehicle profile review queue. Please try again.';
      this.pending = [];
    } finally {
      this.loading = false;
    }
  }

  private buildUpdate(item: VehicleProfileReviewItem): VehicleReviewUpdatePayload {
    return {
      make: item.make,
      model: item.model,
      year: item.year,
      engine: item.engine,
      fuelType: item.fuelType,
      protocol: item.protocol,
    };
  }

  private async submit(
    item: VehicleProfileReviewItem,
    action: 'approve' | 'reject' | 'needs_research',
    rejectionReason?: string,
  ): Promise<void> {
    this.savingId = item.id;
    this.error = '';
    try {
      await this.reviewQueue.submitReview(item.id, action, this.buildUpdate(item), rejectionReason);
      this.pending = this.pending.filter(p => p.id !== item.id);
      delete this.rejectionReasonById[item.id];
    } catch {
      this.error = 'Unable to save review action. Please try again.';
    } finally {
      this.savingId = null;
    }
  }
}
