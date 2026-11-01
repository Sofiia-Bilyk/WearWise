import type { ClothingItem } from '../types';
import type { Detection } from '../api/detection';

export type GarmentResolution =
  | { kind: 'existing'; itemId: string }
  | { kind: 'new'; item: ClothingItem };

export interface DraftGarment {
  detection: Detection;
  resolution: GarmentResolution | null;
}

/** Missing server matches are unresolved, never silently treated as new. */
export function beginDraft(detections: Detection[], wardrobe: ClothingItem[]): DraftGarment[] {
  const ids = new Set(wardrobe.map(item => item.id));
  return detections.map(detection => ({
    detection,
    resolution: detection.matchedItemId && ids.has(detection.matchedItemId)
      ? { kind: 'existing', itemId: detection.matchedItemId }
      : null,
  }));
}

export function resolveDraft(garments: DraftGarment[], id: string, resolution: GarmentResolution | null) {
  return garments.map(garment => garment.detection.id === id
    ? { ...garment, resolution } : garment);
}

export function isDraftReady(garments: DraftGarment[]) {
  return garments.length > 0 && garments.every(garment => garment.resolution !== null);
}

/** Validate the entire draft before any request creates a wardrobe item. */
export function buildSavePlan(garments: DraftGarment[], wardrobe: ClothingItem[]) {
  if (!isDraftReady(garments)) throw new Error('Please identify every item before confirming.');
  const seen = new Set<string>();
  const plan: { detectionId: string; kind: 'existing' | 'new'; item: ClothingItem }[] = [];
  for (const garment of garments) {
    const choice = garment.resolution!;
    const item = choice.kind === 'existing'
      ? wardrobe.find(item => item.id === choice.itemId) : choice.item;
    if (!item) throw new Error('A selected wardrobe item is unavailable. Change that selection.');
    if (choice.kind === 'new' && !item.name.trim()) throw new Error('New items need a name.');
    if (choice.kind === 'existing') {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
    }
    plan.push({ detectionId: garment.detection.id, kind: choice.kind, item });
  }
  return plan;
}
