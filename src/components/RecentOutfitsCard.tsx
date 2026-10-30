import React, { useState } from 'react';
import { ClothingItem, Outfit } from '../types';

interface RecentOutfitsCardProps {
  outfits: Outfit[];
  wardrobe: ClothingItem[];
  onSelectOutfit: (outfit: Outfit) => void;
}

const COLLAPSED_LIMIT = 5;

/** History list of recently logged outfits with collage thumbnails. */
export const RecentOutfitsCard: React.FC<RecentOutfitsCardProps> = ({
  outfits,
  wardrobe,
  onSelectOutfit,
}) => {
  const [showAll, setShowAll] = useState(false);
  const sortedOutfits = [...outfits].sort((a, b) => b.date.localeCompare(a.date));
  const visible = showAll ? sortedOutfits : sortedOutfits.slice(0, COLLAPSED_LIMIT);

  return (
    <div className="bg-white p-5 rounded-xl border border-stone-100 shadow-sm flex flex-col h-[320px] min-w-0">
      <h3 className="text-sm font-bold text-stone-800 mb-3">Recent Outfits</h3>
      <ul className="flex-1 overflow-y-auto space-y-2 no-scrollbar">
        {visible.map((outfit) => {
          // Count renderable images so missing wardrobe entries cannot leave half-empty thumbnails.
          const thumbnailItems = outfit.items
            .map((itemId) => wardrobe.find((item) => item.id === itemId))
            .filter((item): item is ClothingItem => Boolean(item))
            .slice(0, 4);
          return (
          <li key={outfit.id}>
            <button
              type="button"
              onClick={() => onSelectOutfit(outfit)}
              className="w-full flex gap-3 p-2 text-left hover:bg-stone-50 rounded-lg transition-colors border border-transparent hover:border-stone-100"
            >
              <div
                aria-hidden="true"
                className={`grid ${thumbnailItems.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-0.5 w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-stone-100 shadow-sm`}
              >
                {thumbnailItems.length === 0 ? (
                  <img src="/placeholder-garment.svg" alt="" className="w-full h-full object-cover" />
                ) : thumbnailItems.map((item, index) => (
                  <img
                    key={item.id}
                    src={item.image || '/placeholder-garment.svg'}
                    alt=""
                    loading="lazy"
                    className={`w-full h-full min-h-0 object-cover ${thumbnailItems.length === 3 && index === 0 ? 'row-span-2' : ''}`}
                  />
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold text-stone-700">{outfit.date}</p>
                <p className="text-[10px] text-stone-400">{outfit.items.length} items worn</p>
              </div>
            </button>
          </li>
          );
        })}
        {outfits.length === 0 && (
          <li className="py-10 text-center text-sm text-stone-400">Your logged outfits will appear here.</li>
        )}
      </ul>
      {outfits.length > COLLAPSED_LIMIT && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full py-2 mt-3 border border-stone-100 text-stone-400 text-[10px] font-bold uppercase tracking-widest hover:text-stone-800 transition-colors"
        >
          {showAll ? 'Show Less' : 'View History'}
        </button>
      )}
    </div>
  );
};
