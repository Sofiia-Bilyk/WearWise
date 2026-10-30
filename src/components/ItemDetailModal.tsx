import React from 'react';
import { X } from 'lucide-react';
import { ClothingItem } from '../types';

interface ItemDetailModalProps {
  item: ClothingItem;
  onClose: () => void;
}

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ item, onClose }) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-lg font-serif italic text-stone-900">{item.name}</h3>
            <p className="text-[10px] font-bold tracking-widest uppercase text-stone-400 mt-0.5">
              {item.category}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close item details"
            className="p-1.5 text-stone-400 hover:text-stone-900 transition-colors"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto">
          <div className="w-full max-h-56 aspect-[4/3] bg-stone-100 rounded-lg overflow-hidden mb-4">
            <img
              src={item.image || '/placeholder-garment.svg'}
              alt={item.name}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Color</p>
              <p className="font-serif text-stone-800">{item.color || 'Unspecified'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Last Worn</p>
              <p className="font-serif text-stone-800">{item.lastWorn}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Wear Count</p>
              <p className="font-serif text-stone-800">{item.wearCount}</p>
            </div>
            {item.cost != null ? (
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                  Cost / Wear
                </p>
                <p className="font-serif text-stone-800 border-b border-primary-200 inline">
                  ${(item.wearCount > 0 ? item.cost / item.wearCount : item.cost).toFixed(2)}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
