import React, { useState } from 'react';
import type { ClothingItem, Outfit } from '../types';
import { groupOutfitHistory, formatOutfitDay, formatEntryTime } from '../utils/outfitHistory';

interface RecentOutfitsCardProps {
  outfits: Outfit[];
  wardrobe: ClothingItem[];
  onSelectOutfit: (outfit: Outfit) => void;
}

const COLLAPSED_DAY_LIMIT = 5;

/** Keep a day's entries together, with each outfit labeled by entry time. */
export const RecentOutfitsCard: React.FC<RecentOutfitsCardProps> = ({ outfits, wardrobe, onSelectOutfit }) => {
  const [showAll, setShowAll] = useState(false);
  const days = groupOutfitHistory(outfits);
  // Collapse whole days rather than cutting a day's history into two pieces.
  const visibleDays = showAll ? days : days.slice(0, COLLAPSED_DAY_LIMIT);

  return (
    <section aria-label="Recent outfit history" className="bg-white p-5 rounded-xl border border-stone-100 shadow-sm flex flex-col h-[320px] min-w-0">
      <h3 className="text-sm font-bold text-stone-800 mb-3">Recent Outfits</h3>
      <ul className="flex-1 overflow-y-auto space-y-4 min-h-0 pr-1">
        {visibleDays.map(day => (
          <li key={day.date}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h4 className="text-xs font-semibold text-stone-700">{formatOutfitDay(day.date)}</h4>
              <span className="text-[10px] text-stone-400">{day.outfits.length} {day.outfits.length === 1 ? 'entry' : 'entries'}</span>
            </div>
            <ul aria-label={`Outfits for ${formatOutfitDay(day.date)}`} className="space-y-2 border-l border-stone-200 pl-3">
              {day.outfits.map(outfit => {
                // Count renderable photos, preserving full-width single thumbnails.
                const thumbnailItems = outfit.items
                  .map(id => wardrobe.find(item => item.id === id))
                  .filter((item): item is ClothingItem => Boolean(item))
                  .slice(0, 4);
                return (
                  <li key={outfit.id}>
                    <button type="button" onClick={() => onSelectOutfit(outfit)}
                      className="w-full flex items-center gap-3 p-2 text-left hover:bg-stone-50 rounded-lg transition-colors border border-transparent hover:border-stone-100">
                      <div aria-hidden="true" className={`grid ${thumbnailItems.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-0.5 w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-stone-100 shadow-sm`}>
                        {thumbnailItems.length === 0
                          ? <img src="/placeholder-garment.svg" alt="" className="w-full h-full object-cover" />
                          : thumbnailItems.map((item, index) => (
                            <img key={item.id} src={item.image || '/placeholder-garment.svg'} alt="" loading="lazy"
                              className={`w-full h-full min-h-0 object-cover ${thumbnailItems.length === 3 && index === 0 ? 'row-span-2' : ''}`} />
                          ))}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-stone-700">{formatEntryTime(outfit)}</p>
                        <p className="text-[10px] text-stone-400">{outfit.items.length} {outfit.items.length === 1 ? 'item worn' : 'items worn'}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
        {days.length === 0 && <li className="py-10 text-center text-sm text-stone-400">Your logged outfits will appear here.</li>}
      </ul>
      {days.length > COLLAPSED_DAY_LIMIT && (
        <button type="button" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}
          className="w-full py-2 mt-3 border border-stone-100 text-stone-400 text-[10px] font-bold uppercase tracking-widest hover:text-stone-800 transition-colors">
          {showAll ? 'Show Less' : 'View History'}
        </button>
      )}
    </section>
  );
};
