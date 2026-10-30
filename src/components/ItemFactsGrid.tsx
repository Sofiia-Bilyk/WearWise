import React from 'react';
import { ClothingItem } from '../types';

interface ItemFactsGridProps {
  item: ClothingItem;
  isEditing: boolean;
  color: string;
  cost: string;
  postponedUntil: string;
  onColorChange: (value: string) => void;
  onCostChange: (value: string) => void;
  onPostponedUntilChange: (value: string) => void;
}

const formatCostPerWear = (cost: number | undefined, wearCount: number) => {
  if (cost != null && wearCount > 0) return `$${(cost / wearCount).toFixed(2)}`;
  if (cost != null) return `$${cost.toFixed(2)}`;
  return 'N/A';
};

/**
 * Two-column facts grid in the item detail modal: wear count, last worn,
 * color, cost-per-wear, and the postpone date with its hint copy.
 */
export const ItemFactsGrid: React.FC<ItemFactsGridProps> = ({
  item,
  isEditing,
  color,
  cost,
  postponedUntil,
  onColorChange,
  onCostChange,
  onPostponedUntilChange,
}) => (
  <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4 border-t border-b border-stone-200 py-4">
    <div>
      <span className="block text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1">
        Wear Count
      </span>
      <span className="text-lg font-serif text-stone-800">{item.wearCount}</span>
    </div>

    <div>
      <span className="block text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1">
        Last Worn
      </span>
      <span className="text-sm font-serif text-stone-800">{item.lastWorn}</span>
    </div>

    <div>
      <span className="block text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1">
        Color
      </span>
      {isEditing ? (
        <input
          type="text"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          aria-label="Color"
          className="w-full bg-transparent border-b border-stone-300 py-0.5 text-sm font-serif text-stone-800 focus:outline-none focus:border-primary-500"
        />
      ) : (
        <span className="text-sm font-serif text-stone-800">{item.color}</span>
      )}
    </div>

    <div>
      <span className="block text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1">
        {isEditing ? 'Cost ($)' : 'Cost / Wear'}
      </span>
      {isEditing ? (
        <input
          type="number"
          step="0.01"
          min="0"
          value={cost}
          onChange={(e) => onCostChange(e.target.value)}
          placeholder="0.00"
          aria-label="Cost in dollars"
          className="w-full bg-transparent border-b border-stone-300 py-0.5 text-sm font-serif text-stone-800 focus:outline-none focus:border-primary-500"
        />
      ) : (
        <span className="text-sm font-serif text-stone-800">
          {formatCostPerWear(item.cost, item.wearCount)}
        </span>
      )}
    </div>

    <div className="col-span-2">
      <span
        id="postpone-label"
        className="block text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1"
      >
        Postponed Until
      </span>
      {/* Hint added after the 3rd user interview — explains seasonal use. */}
      <p
        id="postpone-hint"
        className="text-[11px] italic text-stone-500 mb-1.5 leading-snug"
      >
        Off-season piece? Pick the date its season starts so we
        pause "forgotten item" reminders until then.
      </p>
      {isEditing ? (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={postponedUntil}
            onChange={(e) => onPostponedUntilChange(e.target.value)}
            aria-labelledby="postpone-label"
            aria-describedby="postpone-hint"
            className="bg-transparent border-b border-stone-300 py-0.5 text-sm font-serif text-stone-800 focus:outline-none focus:border-primary-500"
          />
          {postponedUntil && (
            <button
              type="button"
              onClick={() => onPostponedUntilChange('')}
              className="text-[9px] font-bold uppercase tracking-widest text-stone-400 hover:text-red-500 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      ) : (
        <span className="text-sm font-serif text-stone-800">{item.postponedUntil || 'N/A'}</span>
      )}
    </div>
  </div>
);
