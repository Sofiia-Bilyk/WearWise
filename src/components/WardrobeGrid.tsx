import React from 'react';
import { Trash2 } from 'lucide-react';
import { ClothingItem } from '../types';

interface WardrobeGridProps {
  items: ClothingItem[];
  onSelectItem: (id: string) => void;
  onDeleteItem: (id: string) => Promise<void> | void;
  onClearFilters: () => void;
  /** Called when delete fails so the page can show a toast. */
  onDeleteError: (message: string) => void;
}

/**
 * Grid of wardrobe item cards. Each card has a hover-revealed delete button;
 * an empty state offers a "clear filters" action.
 */
export const WardrobeGrid: React.FC<WardrobeGridProps> = ({
  items,
  onSelectItem,
  onDeleteItem,
  onClearFilters,
  onDeleteError,
}) => {
  if (items.length === 0) {
    return (
      <div className="py-32 text-center">
        <p className="font-serif italic text-2xl text-stone-400">No pieces found.</p>
        <button
          onClick={onClearFilters}
          className="mt-6 text-primary-600 text-xs font-bold uppercase tracking-widest border-b border-primary-600 pb-1 hover:text-primary-700 hover:border-primary-700 transition-colors"
        >
          Clear Filters
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-5 gap-y-6">
      {items.map((item) => (
        <div
          key={item.id}
          onClick={() => onSelectItem(item.id)}
          className="group cursor-pointer"
        >
          <div className="aspect-[3/4] overflow-hidden bg-stone-100 mb-2 relative">
            <img
              src={item.image || '/placeholder-garment.svg'}
              alt={item.name}
              className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 ease-out"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-500" />
            <button
              type="button"
              aria-label={`Delete ${item.name}`}
              onClick={async (e) => {
                e.stopPropagation();
                if (!window.confirm('Are you sure you want to delete this piece?')) return;
                try {
                  await onDeleteItem(item.id);
                } catch {
                  onDeleteError('Failed to delete item.');
                }
              }}
              className="absolute top-2 right-2 p-1.5 bg-white/80 text-stone-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="text-center">
            <h3 className="font-serif text-sm text-stone-900 italic group-hover:text-primary-600 transition-colors">
              {item.name}
            </h3>
            <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mt-0.5">
              {item.category}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};
