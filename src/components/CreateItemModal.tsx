import React, { useState, useRef, useEffect, useId } from 'react';
import { X, Upload } from 'lucide-react';
import { ClothingItem, Category } from '../types';

interface CreateItemModalProps {
  initialItem?: ClothingItem;
  title?: string;
  submitLabel?: string;
  onCreateItem: (item: ClothingItem) => void | Promise<void>;
  onClose: () => void;
}

const categories: Category[] = ['Top', 'Bottom', 'Shoes', 'Outerwear', 'Accessory'];

export const CreateItemModal: React.FC<CreateItemModalProps> = ({ onCreateItem, onClose, initialItem, title = 'Add New Piece', submitLabel = 'Create Piece' }) => {
  const [form, setForm] = useState({
    name: initialItem?.name ?? '',
    category: initialItem?.category ?? 'Top' as Category,
    image: initialItem?.image ?? '',
    color: initialItem?.color ?? '',
    brand: initialItem?.brand ?? '',
    cost: initialItem?.cost?.toString() ?? '',
  });
  const [imagePreview, setImagePreview] = useState<string | null>(initialItem?.image || null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const savingRef = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setForm(prev => ({ ...prev, image: dataUrl }));
      setImagePreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleCreate = async () => {
    if (savingRef.current || !form.name.trim() || (form.cost && (!Number.isFinite(Number(form.cost)) || Number(form.cost) < 0))) return;
    const newItem: ClothingItem = {
      id: `item-${Date.now()}`,
      name: form.name.trim(),
      category: form.category,
      image: form.image || `/placeholder-garment.svg`,
      wearCount: 0,
      lastWorn: 'Never',
      color: form.color,
      brand: form.brand,
      cost: form.cost ? parseFloat(form.cost) : undefined,
      addedDate: new Date().toISOString().split('T')[0],
    };
    savingRef.current = true;
    setIsSaving(true);
    setSaveError('');
    try {
      // The parent closes the form only after the server confirms creation.
      await onCreateItem(newItem);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save this item.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-busy={isSaving} onCancel={event => { event.preventDefault(); if (!savingRef.current) onClose(); }} className="w-[calc(100%_-_2rem)] max-w-2xl max-h-[90dvh] overflow-y-auto rounded-3xl bg-white p-0 backdrop:bg-stone-900/60">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-stone-200">
        <div className="p-8 border-b border-stone-100 flex items-center justify-between">
          <h3 id={titleId} className="text-2xl font-serif italic text-stone-900">{title}</h3>
          <button type="button" aria-label="Cancel item form" disabled={isSaving} onClick={onClose} className="text-stone-400 hover:text-stone-900"><X size={24} /></button>
        </div>
        <fieldset disabled={isSaving} className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 min-w-0">
          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Item Name</label>
              <input
                type="text"
                aria-label="Item name"
                value={form.name}
                onChange={(e) => setForm({...form, name: e.target.value})}
                placeholder="e.g. Cashmere Sweater"
                className="w-full bg-transparent border-b border-stone-200 py-2 font-serif italic text-lg focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Category</label>
              <select
                aria-label="Item category" value={form.category}
                onChange={(e) => setForm({...form, category: e.target.value as Category})}
                className="w-full bg-transparent border-b border-stone-200 py-2 text-sm font-bold uppercase tracking-widest focus:outline-none focus:border-primary-500"
              >
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Color</label>
              <input
                type="text"
                aria-label="Item color" value={form.color}
                onChange={(e) => setForm({...form, color: e.target.value})}
                placeholder="e.g. Navy Blue"
                className="w-full bg-transparent border-b border-stone-200 py-2 text-sm focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>
          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Brand (Optional)</label>
              <input
                type="text"
                aria-label="Item brand" value={form.brand}
                onChange={(e) => setForm({...form, brand: e.target.value})}
                placeholder="e.g. Everlane"
                className="w-full bg-transparent border-b border-stone-200 py-2 text-sm focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Cost</label>
              <div className="relative">
                <span className="absolute left-0 top-1/2 -translate-y-1/2 text-stone-400">$</span>
                <input
                  type="number"
                  aria-label="Item cost" min="0" step="0.01" value={form.cost}
                  onChange={(e) => setForm({...form, cost: e.target.value})}
                  placeholder="0.00"
                  className="w-full bg-transparent border-b border-stone-200 py-2 pl-4 text-sm focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Photo</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              {imagePreview ? (
                <div className="relative w-full aspect-[3/4] bg-stone-100 rounded-lg overflow-hidden">
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => { setImagePreview(null); setForm(prev => ({ ...prev, image: '' })); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="absolute top-2 right-2 p-1 bg-white/80 rounded-full text-stone-600 hover:text-red-600"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-6 border-2 border-dashed border-stone-200 rounded-lg flex flex-col items-center gap-2 text-stone-400 hover:border-primary-400 hover:text-primary-500 transition-colors"
                >
                  <Upload size={20} />
                  <span className="text-xs font-bold uppercase tracking-widest">Upload Image</span>
                </button>
              )}
            </div>
          </div>
          <div className="md:col-span-2">
            {saveError && <p role="alert" className="mb-3 text-sm text-red-600">{saveError}</p>}
            <button
              type="button"
              disabled={isSaving || !form.name.trim() || (!!form.cost && (!Number.isFinite(Number(form.cost)) || Number(form.cost) < 0))}
              onClick={handleCreate}
              className="w-full py-4 bg-stone-900 text-white text-xs font-bold uppercase tracking-widest hover:bg-primary-600 transition-colors rounded-xl shadow-xl shadow-stone-900/10"
            >
              {isSaving ? 'Saving…' : saveError ? 'Retry save' : submitLabel}
            </button>
          </div>
        </fieldset>
      </div>
    </dialog>
  );
};
