import { Camera, Check, Loader2, Pencil, X } from 'lucide-react';
import type { ClothingItem } from '../types';
import type { DraftGarment } from '../state/garmentResolution';

interface Props {
  draftLocked?: boolean; hasPendingSave?: boolean; canRetrySave?: boolean;
  onCheckSave?: () => void;
  selectedDate: string; onDateChange: (date: string) => void;
  detectedItems: ClothingItem[]; garments: DraftGarment[];
  isDetecting: boolean; isLogSuccess: boolean; isLogging: boolean;
  canSubmit: boolean; unresolvedCount: number; hasPreviewImage: boolean; logError: string;
  onChangeItem: (id: string) => void; onRemoveItem: (id: string) => void;
  onResume: () => void; onUploadClick: () => void; onBrowseWardrobe: () => void;
  onCreateBlank: () => void; onLogOutfit: () => void; onRetry: () => void;
}

/** A reviewable daily draft. Only the final confirmation writes the outfit. */
export function DetectionPanel(props: Props) {
  const { detectedItems, garments, isDetecting, isLogging, isLogSuccess } = props;
  const busy = isLogging || isDetecting || props.draftLocked;
  const canLog = !isLogging && !isDetecting && !isLogSuccess && (props.hasPendingSave ? props.canRetrySave : props.canSubmit && !busy);
  return (
    <section aria-label="Daily log draft" className="w-full lg:w-[420px] shrink-0 bg-stone-50 border-l border-stone-200 flex flex-col min-h-[420px] lg:h-full relative z-10 shadow-xl">
      <header className="px-6 pt-5 pb-3">
        <h2 className="text-2xl font-serif italic text-stone-900">Daily Look</h2>
        <div className="flex items-center justify-between gap-3 mt-3 border-b border-stone-200 pb-2">
          <label htmlFor="outfit-date" className="text-xs text-stone-500">Date</label>
          <input id="outfit-date" type="date" value={props.selectedDate} disabled={busy || isLogSuccess}
            onChange={event => props.onDateChange(event.target.value)} className="bg-transparent text-sm text-stone-700" />
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-3 space-y-4">
        {isLogSuccess ? (
          <div role="status" className="py-12 text-center">
            <Check className="mx-auto text-primary-500 mb-3" size={32} />
            <h3 className="text-xl font-serif italic">Daily log saved</h3>
            <p className="mt-2 text-sm text-stone-500">Your wardrobe and wear history are updated.</p>
            <button type="button" onClick={props.onRetry} className="mt-5 px-4 py-2 border rounded-lg text-sm">Log another look</button>
          </div>
        ) : (
          <>
            <p className="text-xs text-stone-500">{isDetecting ? 'Detecting your garments…' : 'Review your items, then confirm the whole daily log.'}</p>
            {detectedItems.length === 0 && !isDetecting && (
              <div className="py-8 text-center text-stone-400"><Camera size={30} className="mx-auto mb-3" /><p>Capture or upload your look to begin.</p>
                <button type="button" onClick={props.onUploadClick} className="mt-4 text-sm text-primary-600 underline">Upload a photo</button>
              </div>
            )}
            <ul className="space-y-3">
              {detectedItems.map((item, index) => (
                <li key={item.id} className="rounded-xl bg-white border border-stone-200 p-3">
                  <div className="flex items-center gap-3">
                    <img src={item.image || '/placeholder-garment.svg'} alt={item.name} className="w-14 h-16 rounded-lg object-cover bg-stone-100" />
                    <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-stone-800 truncate">{item.name}</p>
                      <p className="text-xs text-stone-500 mt-1">{!garments[index]?.resolution ? 'Needs identification' : garments[index].resolution!.kind === 'new' ? 'New item · not saved yet' : 'From your wardrobe'}</p>
                    </div>
                    <button type="button" disabled={busy} onClick={() => props.onRemoveItem(item.id)} aria-label={`Remove ${item.name}`} className="p-1 text-stone-400 hover:text-red-600 disabled:opacity-40"><X size={16} /></button>
                  </div>
                  <button type="button" disabled={busy} onClick={() => props.onChangeItem(item.id)} className="mt-2 flex items-center gap-1 text-xs text-primary-600 disabled:opacity-40"><Pencil size={12} />{garments[index]?.resolution ? 'Change' : 'Identify item'}</button>
                </li>
              ))}
            </ul>
            {props.unresolvedCount > 0 && (
              <button type="button" disabled={busy} onClick={props.onResume} className="w-full rounded-lg bg-primary-50 border border-primary-200 p-3 text-sm text-primary-700 disabled:opacity-40">Continue identifying items ({props.unresolvedCount})</button>
            )}
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={props.onBrowseWardrobe} className="flex-1 rounded-lg border p-2 text-xs disabled:opacity-40">Browse Wardrobe</button>
              <button type="button" disabled={busy} onClick={props.onCreateBlank} className="flex-1 rounded-lg border p-2 text-xs disabled:opacity-40">+ New Item</button>
            </div>
          </>
        )}
      </div>
      {!isLogSuccess && <footer className="px-6 py-4 border-t border-stone-200">
        {props.hasPendingSave && <p className="mb-3 text-xs text-stone-600">A save is awaiting confirmation. Retry the same log or check its status before editing.</p>}
        {props.logError && <p role="alert" className="mb-3 text-xs text-red-600">{props.logError}</p>}
        <div className="flex gap-2">
          {(props.hasPreviewImage || detectedItems.length > 0) && <button type="button" disabled={!!busy} onClick={props.onRetry} className="rounded-lg px-3 py-3 bg-stone-200 text-xs disabled:opacity-40">Retry</button>}
          {props.hasPendingSave && <button type="button" disabled={isLogging} onClick={props.onCheckSave} className="rounded-lg px-3 py-3 bg-stone-200 text-xs disabled:opacity-40">Check save status</button>}
          <button type="button" disabled={!canLog} onClick={props.onLogOutfit}
            className="flex-1 rounded-lg px-3 py-3 bg-primary-500 text-white text-xs font-semibold disabled:bg-stone-200 disabled:text-stone-400 flex items-center justify-center gap-2">
            {isLogging ? <><Loader2 size={14} className="animate-spin" />Saving…</> : props.hasPendingSave ? 'Retry saving' : 'Confirm daily log'}
          </button>
        </div>
      </footer>}
    </section>
  );
}
