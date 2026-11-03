import type { ClothingItem } from '../types';
import type { DraftGarment } from './garmentResolution';
import { buildSavePlan } from './garmentResolution.ts';

export interface OutfitSubmission {
  submissionId: string;
  date: string;
  entries: Array<
    | { kind: 'existing'; itemId: string }
    | { kind: 'new'; draftId: string; item: Pick<ClothingItem, 'name' | 'category' | 'color' | 'brand' | 'cost' | 'image'> }
  >;
}

/** Snapshot only writable fields; retries must send this exact confirmed choice. */
export function prepareSubmission(garments: DraftGarment[], wardrobe: ClothingItem[], date: string,
  submissionId: string): OutfitSubmission {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choose a valid outfit date.');
  return {
    submissionId, date,
    entries: buildSavePlan(garments, wardrobe).map(entry => entry.kind === 'existing'
      ? { kind: 'existing' as const, itemId: entry.item.id }
      : { kind: 'new' as const, draftId: entry.detectionId, item: {
        name: entry.item.name, category: entry.item.category, color: entry.item.color,
        brand: entry.item.brand, cost: entry.item.cost, image: entry.item.image,
      } }),
  };
}

/** Replace by ID instead of incrementing wear counts on a replayed response. */
export function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const updated = new Map(incoming.map(item => [item.id, item]));
  return [...incoming, ...current.filter(item => !updated.has(item.id))];
}

const receiptKey = (accountId: string | number) => `wearwise:pending-outfit:${accountId}`;

export function saveReceipt(accountId: string | number, submissionId: string) {
  // Persist only the attempt ID, never garment photos or the full draft.
  sessionStorage.setItem(receiptKey(accountId), submissionId);
}

export function readReceipt(accountId: string | number): string | null {
  return sessionStorage.getItem(receiptKey(accountId));
}

export function clearReceipt(accountId: string | number, expectedSubmissionId: string): boolean {
  const key = receiptKey(accountId);
  // Read and remove synchronously in the same tab. An older completion must
  // never erase the recovery receipt belonging to a newer attempt.
  if (sessionStorage.getItem(key) !== expectedSubmissionId) return false;
  sessionStorage.removeItem(key);
  return true;
}
