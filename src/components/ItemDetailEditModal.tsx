import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Category, ClothingItem } from '../types';
import { ItemImagePanel } from './ItemImagePanel';
import { ItemFactsGrid } from './ItemFactsGrid';

interface ItemDetailEditModalProps {
  item: ClothingItem;
  /** Items to surface as "Pairs well with" suggestions. */
  recommendations: ClothingItem[];
  categories: Category[];
  onClose: () => void;
  onSelectRecommendation: (id: string) => void;
  onLogWear: (item: ClothingItem) => void;
  onSave: (item: ClothingItem) => void;
}

interface EditForm {
  name: string;
  category: Category;
  color: string;
  cost: string;
  postponedUntil: string;
  image: string;
}

const buildInitialForm = (item: ClothingItem): EditForm => ({
  name: item.name,
  category: item.category,
  color: item.color || '',
  cost: item.cost != null ? String(item.cost) : '',
  postponedUntil: item.postponedUntil || '',
  image: item.image || '',
});

/**
 * Detail-and-edit modal for a single wardrobe item.
 * Owns its own edit-form state — the parent only sees the saved result.
 */
export const ItemDetailEditModal: React.FC<ItemDetailEditModalProps> = ({
  item,
  recommendations,
  categories,
  onClose,
  onSelectRecommendation,
  onLogWear,
  onSave,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(() => buildInitialForm(item));

  const beginEditing = () => {
    setForm(buildInitialForm(item));
    setIsEditing(true);
  };

  const handleSave = () => {
    onSave({
      ...item,
      name: form.name,
      category: form.category,
      color: form.color,
      cost: form.cost ? parseFloat(form.cost) : undefined,
      postponedUntil: form.postponedUntil || undefined,
      image: form.image,
    });
    setIsEditing(false);
  };

  const displayedImage = (isEditing ? form.image : item.image) || '/placeholder-garment.svg';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-100/80 backdrop-blur-md animate-in fade-in duration-300"
    >
      <div className="relative bg-[#fafaf9] w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col md:flex-row shadow-2xl animate-in zoom-in-95 duration-300 border border-stone-200">
        {/* Single close control consolidated after the 3rd user interview. */}
        <button
          onClick={onClose}
          aria-label="Close item details"
          className="absolute top-3 right-3 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm text-stone-600 hover:bg-white hover:text-stone-900 shadow-sm transition-colors"
        >
          <X size={18} aria-hidden="true" />
        </button>

        <ItemImagePanel
          imageSrc={displayedImage}
          altText={item.name}
          isEditing={isEditing}
          onImageSelected={(dataUrl) => setForm((prev) => ({ ...prev, image: dataUrl }))}
        />

        <div className="w-full md:w-1/2 p-6 flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <div className="w-full">
              {isEditing ? (
                <div className="space-y-3">
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
                    aria-label="Category"
                    className="block w-full bg-transparent border-b border-stone-300 py-1 text-xs font-bold uppercase tracking-widest focus:outline-none focus:border-primary-500"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    aria-label="Item name"
                    className="block w-full bg-transparent border-b border-stone-300 py-1 text-2xl font-serif italic focus:outline-none focus:border-primary-500"
                  />
                </div>
              ) : (
                <>
                  <span className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em] mb-1 block">
                    {item.category}
                  </span>
                  <h2 id="item-detail-title" className="text-2xl font-serif italic text-stone-900 leading-tight">
                    {item.name}
                  </h2>
                </>
              )}
            </div>
            {/* Spacer keeps the title clear of the absolute close button. */}
            <div aria-hidden="true" className="w-10 flex-shrink-0" />
          </div>

          <ItemFactsGrid
            item={item}
            isEditing={isEditing}
            color={form.color}
            cost={form.cost}
            postponedUntil={form.postponedUntil}
            onColorChange={(value) => setForm({ ...form, color: value })}
            onCostChange={(value) => setForm({ ...form, cost: value })}
            onPostponedUntilChange={(value) => setForm({ ...form, postponedUntil: value })}
          />

          <div className="mb-auto">
            <h3 className="text-sm font-serif italic text-stone-900 mb-3">Pairs well with</h3>
            <div className="grid grid-cols-3 gap-2">
              {recommendations.map((rec) => (
                <button
                  key={rec.id}
                  type="button"
                  onClick={() => onSelectRecommendation(rec.id)}
                  className="group cursor-pointer"
                  aria-label={`View ${rec.name}`}
                >
                  <div className="aspect-[3/4] overflow-hidden bg-stone-100">
                    <img
                      src={rec.image || '/placeholder-garment.svg'}
                      alt={rec.name}
                      className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-4 mt-4 pt-4 border-t border-stone-200">
            <button
              onClick={() => onLogWear(item)}
              className="flex-1 py-2.5 bg-primary-500 text-white text-xs font-bold uppercase tracking-widest hover:bg-primary-600 transition-colors shadow-lg shadow-primary-500/20"
            >
              Log Wear
            </button>
            {isEditing ? (
              <button
                onClick={handleSave}
                className="px-6 py-2.5 bg-stone-900 text-white text-xs font-bold uppercase tracking-widest hover:bg-primary-600 transition-colors"
              >
                Save
              </button>
            ) : (
              <button
                onClick={beginEditing}
                className="px-6 py-2.5 border border-primary-200 text-primary-600 text-xs font-bold uppercase tracking-widest hover:border-primary-600 hover:text-primary-600 transition-colors"
              >
                Edit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
