import { request } from './client';
import type { ApiItem } from './items';
import type { OutfitSubmission } from '../state/outfitSubmission';

export interface SubmissionResult {
  submissionId: string;
  outfit: ApiOutfit;
  items: ApiItem[];
}

export interface SubmissionResolution {
  status: 'saved' | 'cancelled' | 'pending';
  result: SubmissionResult | null;
}

export interface ApiOutfit {
  id: string;
  date: string;
  loggedAt?: string | null; // Actual entry timestamp, including its timezone.
  items: string[];
  imagePath: string | null;
}

export const outfitsApi = {
  submit: (payload: OutfitSubmission, image?: File | null): Promise<SubmissionResult> => {
    const form = new FormData();
    form.append('payload', JSON.stringify(payload));
    if (image) form.append('image', image);
    return request<SubmissionResult>('/outfit-submissions', { method: 'POST', body: form, signal: AbortSignal.timeout(30000) });
  },
  resolveSubmission: (key: string) => request<SubmissionResolution>(
    `/outfit-submissions/${encodeURIComponent(key)}/resolve`, { method: 'POST', body: '{}', signal: AbortSignal.timeout(30000) },
  ),
  list: () => request<ApiOutfit[]>('/outfits'),
  create: (itemIds: string[], wornDate: string, image?: File | null): Promise<ApiOutfit> => {
    if (image) {
      const form = new FormData();
      form.append('date', wornDate);
      itemIds.forEach(id => form.append('item_ids', id));
      form.append('image', image);
      return request<ApiOutfit>('/outfits', { method: 'POST', body: form });
    }
    return request<ApiOutfit>('/outfits', {
      method: 'POST',
      body: JSON.stringify({ date: wornDate, item_ids: itemIds }),
    });
  },
};
