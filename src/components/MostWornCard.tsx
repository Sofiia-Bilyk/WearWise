import React from 'react';
import { ClothingItem } from '../types';

interface MostWornCardProps {
  items: ClothingItem[];
  onShowDetails: (item: ClothingItem) => void;
}

/** A ranked gallery of the six most-worn wardrobe items. */
export const MostWornCard: React.FC<MostWornCardProps> = ({ items, onShowDetails }) => (
  <section className="bg-white p-5 rounded-xl border border-stone-100 shadow-sm flex flex-col h-[300px] min-w-0">
    <div className="flex items-center justify-between gap-3 mb-3">
      <h3 className="text-sm font-bold text-stone-800">Most Worn Items</h3>
      <span className="text-[10px] text-stone-400">Your wardrobe favorites</span>
    </div>
    {items.length > 0 ? (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto min-h-0 pr-1">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onShowDetails(item)}
            aria-label={`View ${item.name}, worn ${item.wearCount} ${item.wearCount === 1 ? 'time' : 'times'}`}
            className="group min-w-0 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
          >
            <div className="relative h-28 rounded-lg overflow-hidden bg-stone-50 border border-stone-100">
              <img src={item.image || '/placeholder-garment.svg'} alt={item.name} loading="lazy" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
              <span className="absolute top-1.5 left-1.5 bg-white/90 text-stone-700 rounded px-1.5 py-0.5 text-[9px] font-bold">#{index + 1}</span>
            </div>
            <p className="mt-1.5 text-xs font-semibold text-stone-800 truncate">{item.name}</p>
            <p className="text-[10px] text-primary-600 font-medium">{item.wearCount} {item.wearCount === 1 ? 'wear' : 'wears'}</p>
          </button>
        ))}
      </div>
    ) : (
      <div className="flex-1 flex items-center justify-center text-stone-400 text-sm text-center">
        Log an outfit to discover your most-worn pieces.
      </div>
    )}
  </section>
);
