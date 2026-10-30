import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { ClothingItem } from '../types';
import { insightsHelpers } from '../hooks/useInsightsData';

interface ForgottenItemsCardProps {
  items: ClothingItem[];
  onPostpone: (itemId: string) => void;
}

const COLLAPSED_LIMIT = 6;

/** Shows wardrobe items that haven't been worn in over 30 days. */
export const ForgottenItemsCard: React.FC<ForgottenItemsCardProps> = ({ items, onPostpone }) => {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, COLLAPSED_LIMIT);

  return (
    <div className="bg-white p-5 rounded-xl border-2 border-primary-100 shadow-lg flex flex-col h-[300px]">
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle size={18} className="text-primary-500" aria-hidden="true" />
        <h3 className="text-sm font-bold text-stone-800">Forgotten items</h3>
      </div>
      <p className="text-xs text-stone-500 mb-3 italic">
        These pieces haven't seen the light in over 30 days.
      </p>

      <ul className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar">
        {visible.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-3 group hover:bg-stone-50 p-1.5 -mx-1.5 rounded-lg transition-colors"
          >
            <img
              src={item.image || '/placeholder-garment.svg'}
              alt={item.name}
              className="w-10 h-10 rounded-md object-cover bg-stone-100 shadow-sm"
            />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-stone-800 text-xs truncate">{item.name}</p>
              <p className="text-[10px] text-stone-400">Last worn: {item.lastWorn}</p>
            </div>
            <div className="text-[9px] font-bold text-primary-500 bg-primary-50 px-1.5 py-0.5 rounded flex-shrink-0">
              {insightsHelpers.daysSince(item.lastWorn)}d ago
            </div>
            <button
              type="button"
              onClick={() => onPostpone(item.id)}
              aria-label={`Postpone reminders for ${item.name}`}
              className="text-[9px] font-bold text-stone-400 hover:text-stone-900 uppercase tracking-widest border border-stone-200 px-1.5 py-0.5 rounded transition-colors flex-shrink-0"
            >
              Postpone
            </button>
          </li>
        ))}
      </ul>

      {items.length > COLLAPSED_LIMIT && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full py-2 mt-3 border border-stone-200 text-stone-400 text-[10px] font-bold uppercase tracking-widest hover:border-primary-500 hover:text-primary-500 transition-all rounded-lg"
        >
          {showAll ? 'Show Less' : 'View All Forgotten'}
        </button>
      )}
    </div>
  );
};
