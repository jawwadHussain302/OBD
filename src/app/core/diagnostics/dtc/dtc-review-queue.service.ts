import { Injectable } from '@angular/core';
import { DtcDefinition } from './dtc-definition.model';
import { DTC_REVIEW_ACTION_FUNCTION_URL, DTC_REVIEW_QUEUE_FUNCTION_URL } from '../../ai/ai-endpoint.config';

export type DtcReviewAction = 'approve' | 'reject' | 'needs_research';

export interface DtcReviewUpdatePayload {
  title: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  commonCauses: string[];
  recommendedChecks: string[];
  safeToDrive: boolean;
}

@Injectable({ providedIn: 'root' })
export class DtcReviewQueueService {
  async listPending(): Promise<DtcDefinition[]> {
    const res = await fetch(DTC_REVIEW_QUEUE_FUNCTION_URL, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { items?: DtcDefinition[] };
    return Array.isArray(data.items) ? data.items : [];
  }

  async submitReview(
    code: string,
    action: DtcReviewAction,
    updates: DtcReviewUpdatePayload,
    rejectionReason?: string,
  ): Promise<void> {
    const res = await fetch(DTC_REVIEW_ACTION_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        action,
        reviewedBy: 'local_admin',
        rejectionReason,
        updates,
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
  }
}