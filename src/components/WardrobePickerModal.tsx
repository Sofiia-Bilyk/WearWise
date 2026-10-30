import React, { useState } from 'react';
import { Search, X } from 'lucide-react';
import { ClothingItem } from '../types';

interface WardrobePickerModalProps {
  wardrobe: ClothingItem[];
  onSelect: (item: ClothingItem) => void;
  onCreateBlank: () => void;
  onClose: () => void;
}

export const WardrobePickerModal: React.FC<WardrobePickerModalProps> = ({
  wardrobe,
  onSelect,
  onCreateBlank,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = wardrobe.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in duration-300">
        <div className="p-6 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-serif italic text-stone-900">Select from Wardrobe</h3>
            <p className="text-[10px] uppercase tracking-widest text-stone-400 mt-1">Manual Selection</p>
          </div>
          <button onClick={onClose} className="p-2 text-stone-400 hover:text-stone-900 transition-colors">
            <X size={24} />
          </button>
        </div>
        <div className="p-6 bg-stone-50 border-b border-stone-100">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
            <input type="text" placeholder="Search by name or category..."
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-stone-200 focus:outline-none focus:border-primary-500 font-serif italic"
              autoFocus />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
            {filtered.map((item) => (
              <div key={item.id} onClick={() => onSelect(item)} className="group cursor-pointer space-y-3">
                <div className="aspect-[3/4] overflow-hidden bg-stone-100 relative">
                  <img src={item.image} alt={item.name} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" referrerPolicy="no-referrer" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-stone-900 shadow-xl">Add to Look</div>
                  </div>
                </div>
                <div>
                  <h4 className="font-serif text-sm italic text-stone-900 group-hover:text-primary-600 transition-colors truncate">{item.name}</h4>
                  <p className="text-[9px] uppercase tracking-widest text-stone-400 mt-0.5">{item.category}</p>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full py-12 text-center">
                <p className="font-serif italic text-stone-400">No items found matching your search.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
