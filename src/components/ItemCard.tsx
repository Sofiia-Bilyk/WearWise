import React from 'react';
import { ClothingItem } from '../types';
import { Shirt, Footprints, Watch, Briefcase } from 'lucide-react';

interface ItemCardProps {
  item: ClothingItem;
  onClick: (item: ClothingItem) => void;
  variant?: 'default' | 'compact';
  selected?: boolean;
}

const CategoryIcon = ({ category }: { category: string }) => {
  switch (category) {
    case 'Shoes': return <Footprints size={14} />;
    case 'Accessory': return <Watch size={14} />;
    case 'Outerwear': return <Briefcase size={14} />;
    default: return <Shirt size={14} />;
  }
};

export const ItemCard: React.FC<ItemCardProps> = ({ item, onClick, variant = 'default', selected = false }) => {
  const isCompact = variant === 'compact';

  return (
    <div 
      onClick={() => onClick(item)}
      className={`
        group relative overflow-hidden rounded-2xl bg-white border border-stone-100 cursor-pointer transition-all duration-300
        ${selected ? 'ring-2 ring-primary-500 shadow-md transform scale-[1.02]' : 'hover:-translate-y-1 hover:shadow-lg shadow-sm'}
      `}
    >
      <div className={`relative ${isCompact ? 'aspect-square' : 'aspect-[4/5]'} overflow-hidden bg-stone-100`}>
        <img 
          src={item.image} 
          alt={item.name} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        
        {/* Overlays */}
        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm p-1.5 rounded-full text-stone-700 shadow-sm">
          <CategoryIcon category={item.category} />
        </div>
        
        {!isCompact && (
          <div className="absolute top-3 right-3 bg-primary-500/90 backdrop-blur-sm px-2 py-1 rounded-full text-white text-xs font-medium shadow-sm">
            {item.wearCount}×
          </div>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-medium text-stone-900 truncate">{item.name}</h3>
        {!isCompact && (
          <div className="flex justify-between items-center mt-1">
            <span className="text-xs text-stone-500">{item.brand || item.category}</span>
            <span className="text-xs text-stone-400">Last: {item.lastWorn}</span>
          </div>
        )}
      </div>
    </div>
  );
};