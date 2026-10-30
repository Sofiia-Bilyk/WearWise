import React from 'react';
import { X } from 'lucide-react';
import { ClothingItem, Outfit } from '../types';

interface OutfitDetailModalProps {
  outfit: Outfit;
  wardrobe: ClothingItem[];
  onClose: () => void;
}

export const OutfitDetailModal: React.FC<OutfitDetailModalProps> = ({ outfit, wardrobe, onClose }) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-serif italic text-stone-900">Outfit Details</h3>
            <p className="text-xs font-bold tracking-widest uppercase text-stone-400 mt-1">{outfit.date}</p>
          </div>
          <button onClick={onClose} className="p-2 text-stone-400 hover:text-stone-900 transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-8 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
            {outfit.items.map(itemId => {
              const item = wardrobe.find(w => w.id === itemId);
              if (!item) return null;
              return (
                <div key={itemId} className="space-y-3">
                  <div className="aspect-[3/4] rounded-xl overflow-hidden bg-stone-100">
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <p className="font-serif italic text-sm text-stone-900">{item.name}</p>
                    <p className="text-[10px] uppercase tracking-widest text-stone-400">{item.category}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-10 pt-8 border-t border-stone-100 flex justify-between items-center">
            <div className="text-stone-500 text-sm italic">
              Logged on {outfit.date}
            </div>
            <button
              onClick={onClose}
              className="px-8 py-3 bg-stone-900 text-white text-xs font-bold uppercase tracking-widest hover:bg-primary-600 transition-colors rounded-xl"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
