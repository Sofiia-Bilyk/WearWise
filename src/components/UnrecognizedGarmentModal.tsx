import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import type { ClothingItem } from '../types';

interface Props {
  item: ClothingItem;
  remainingCount: number;
  onFindInWardrobe: () => void;
  onCreateNew: () => void;
  onPause: () => void;
}

/** One unmatched crop at a time. Escape pauses without discarding progress. */
export function UnrecognizedGarmentModal({ item, remainingCount, onFindInWardrobe, onCreateNew, onPause }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog ref={ref} aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onPause(); }}
      className="w-[calc(100%_-_2rem)] max-w-md rounded-2xl bg-white p-6 shadow-2xl backdrop:bg-stone-900/60">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={titleId} className="text-xl font-semibold text-stone-900">Help identify this item</h2>
          <p className="mt-1 text-sm text-stone-500" role="status">{remainingCount} {remainingCount === 1 ? 'item' : 'items'} remaining to identify</p>
        </div>
        <button type="button" onClick={onPause} aria-label="Pause identification and return to draft" className="rounded p-1 text-stone-500"><X size={20} /></button>
      </div>
      <img src={item.image || '/placeholder-garment.svg'} alt={`Detected garment: ${item.name}`}
        className="mx-auto my-5 h-64 w-full rounded-xl bg-stone-100 object-contain" />
      <p className="mb-5 text-sm text-stone-600">Choose an item from your wardrobe, or add this as a new piece.</p>
      <div className="grid gap-3">
        <button type="button" onClick={onFindInWardrobe} className="rounded-xl border border-stone-300 px-4 py-3 text-sm font-semibold hover:bg-stone-50">Find in wardrobe</button>
        <button type="button" onClick={onCreateNew} className="rounded-xl bg-primary-500 px-4 py-3 text-sm font-semibold text-white hover:bg-primary-600">It's a new item</button>
      </div>
    </dialog>
  );
}
