import React from 'react';
import { Plus, Search } from 'lucide-react';
import { Category } from '../types';

interface WardrobeToolbarProps {
  totalCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  categories: (Category | 'All')[];
  selectedCategory: Category | 'All';
  onSelectCategory: (c: Category | 'All') => void;
  onAddClick: () => void;
}

/** Page header for the wardrobe: title, "Add Piece" button, search and category filters. */
export const WardrobeToolbar: React.FC<WardrobeToolbarProps> = ({
  totalCount,
  searchQuery,
  onSearchChange,
  categories,
  selectedCategory,
  onSelectCategory,
  onAddClick,
}) => (
  <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
    <div>
      <h1 className="text-5xl font-serif italic text-stone-900 mb-4">The Collection</h1>
      <p className="text-stone-500 font-serif italic text-lg">{totalCount} pieces</p>
    </div>

    <div className="flex flex-col items-end gap-6">
      <button
        onClick={onAddClick}
        className="flex items-center gap-2 px-6 py-2 bg-stone-900 text-white text-xs font-bold uppercase tracking-widest rounded-full hover:bg-primary-600 transition-all shadow-lg shadow-stone-900/10"
      >
        <Plus size={16} aria-hidden="true" />
        <span>Add Piece</span>
      </button>

      <div className="flex flex-col md:flex-row gap-6 items-center">
        <div className="relative group">
          <Search
            aria-hidden="true"
            size={20}
            className="absolute left-0 top-1/2 -translate-y-1/2 text-stone-400 group-hover:text-stone-800 transition-colors"
          />
          <input
            type="search"
            placeholder="Search collection..."
            aria-label="Search wardrobe by item name"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 pr-4 py-2 bg-transparent border-b border-stone-200 text-lg font-serif placeholder:italic focus:outline-none focus:border-stone-900 w-64 transition-all"
          />
        </div>

        <div
          role="tablist"
          aria-label="Filter by category"
          className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-1 md:pb-0"
        >
          {categories.map((cat) => (
            <button
              key={cat}
              role="tab"
              aria-selected={selectedCategory === cat}
              onClick={() => onSelectCategory(cat)}
              className={`text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap pb-1 border-b-2 ${
                selectedCategory === cat
                  ? 'border-primary-500 text-stone-900'
                  : 'border-transparent text-stone-400 hover:text-stone-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>
    </div>
  </div>
);
