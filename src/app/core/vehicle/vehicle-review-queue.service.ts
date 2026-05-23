import { Injectable } from '@angular/core';
import {
  VEHICLE_REVIEW_ACTION_FUNCTION_URL,
  VEHICLE_REVIEW_QUEUE_FUNCTION_URL,
} from '../ai/ai-endpoint.config';

export type VehicleReviewAction = 'approve' | 'reject' | 'needs_research';

type VehicleFuelType = 'petrol' | 'diesel' | 'hybrid' | 'ev' | 'unknown';

export interface VehicleProfileReviewItem {
  id: string;
  make: string;
  model: string;
  year?: number;
  engine?: string;
  fuelType?: VehicleFuelType;
  protocol?: string;
  supportedPids?: string[];
  source: 'local' | 'user_confirmed' | 'ai_generated';
  reviewStatus: 'verified' | 'pending_review' | 'rejected' | 'needs_research';
  createdAt: string;
  updatedAt: string;
}

export interface VehicleReviewUpdatePayload {
  make: string;
  model: string;
  year?: number;
  engine?: string;
  fuelType?: VehicleFuelType;
  protocol?: string;
}

@Injectable({ providedIn: 'root' })
export class VehicleReviewQueueService {
  async listPending(): Promise<VehicleProfileReviewItem[]> {
    const res = await fetch(VEHICLE_REVIEW_QUEUE_FUNCTION_URL, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { items?: VehicleProfileReviewItem[] };
    return Array.isArray(data.items) ? data.items : [];
  }

  async submitReview(
    id: string,
    action: VehicleReviewAction,
    updates: VehicleReviewUpdatePayload,
    rejectionReason?: string,
  ): Promise<void> {
    const res = await fetch(VEHICLE_REVIEW_ACTION_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action, updates, rejectionReason }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }
}
