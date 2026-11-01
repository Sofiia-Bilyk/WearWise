import { useCallback, useState } from 'react';
import type { ClothingItem } from '../types';
import type { Detection } from '../api/detection';
import { beginDraft, resolveDraft, isDraftReady } from '../state/garmentResolution';
import type { DraftGarment, GarmentResolution } from '../state/garmentResolution';

/** A draft stays in memory until the user confirms the whole daily log. */
export function useGarmentResolution() {
  const [garments, setGarments] = useState<DraftGarment[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const unresolved = garments.filter(garment => garment.resolution === null);

  const begin = useCallback((detections: Detection[], wardrobe: ClothingItem[]) => {
    setGarments(beginDraft(detections, wardrobe));
    setIsPaused(false);
  }, []);
  const resolve = useCallback((id: string, choice: GarmentResolution) => {
    setGarments(previous => resolveDraft(previous, id, choice));
  }, []);
  const remove = useCallback((id: string) => {
    setGarments(previous => previous.filter(garment => garment.detection.id !== id));
  }, []);
  const reconsider = useCallback((id: string) => {
    setGarments(previous => resolveDraft(previous, id, null));
    setIsPaused(false);
  }, []);
  const append = useCallback((item: ClothingItem, existing: boolean) => {
    setGarments(previous => {
      if (existing && previous.some(row => row.resolution?.kind === 'existing' && row.resolution.itemId === item.id)) return previous;
      const detection = { ...item, id: `draft-${crypto.randomUUID()}` };
      return [...previous, { detection, resolution: existing
        ? { kind: 'existing', itemId: item.id } : { kind: 'new', item } }];
    });
  }, []);
  const reset = useCallback(() => { setGarments([]); setIsPaused(false); }, []);

  return {
    garments, currentGarment: isPaused ? null : unresolved[0] ?? null,
    unresolvedCount: unresolved.length, canSubmit: isDraftReady(garments),
    begin, resolve, remove, reconsider, append, reset,
    pause: () => setIsPaused(true), resume: () => setIsPaused(false),
  };
}
