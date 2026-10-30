import React, { useCallback, useMemo, useState } from 'react';
import { useWardrobe } from '../contexts/WardrobeContext';
import { Category } from '../types';
import { CreateItemModal } from '../components/CreateItemModal';
import { WardrobeToolbar } from '../components/WardrobeToolbar';
import { WardrobeGrid } from '../components/WardrobeGrid';
import { ItemDetailEditModal } from '../components/ItemDetailEditModal';

const FILTER_CATEGORIES: (Category | 'All')[] = ['All', 'Top', 'Bottom', 'Shoes', 'Outerwear', 'Accessory'];
const EDITABLE_CATEGORIES: Category[] = ['Top', 'Bottom', 'Shoes', 'Outerwear', 'Accessory'];

/** Wardrobe page: filters, grid, item detail/edit modal, and add-piece flow. */
export const WardrobeView: React.FC = () => {
  const { wardrobe, updateItem, addItem, removeItem, addOutfit } = useWardrobe();

  const [selectedCategory, setSelectedCategory] = useState<Category | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const selectedItem = selectedItemId
    ? wardrobe.find((i) => i.id === selectedItemId) ?? null
    : null;

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return wardrobe.filter((item) => {
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      const matchesSearch = item.name.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [wardrobe, selectedCategory, searchQuery]);

  const recommendedItems = useMemo(() => {
    if (!selectedItem) return [];
    return wardrobe
      .filter((i) => i.id !== selectedItem.id && i.category !== selectedItem.category)
      .slice(0, 3);
  }, [wardrobe, selectedItem]);

  const showDeleteError = useCallback((message: string) => {
    setDeleteError(message);
    window.setTimeout(() => setDeleteError(null), 3000);
  }, []);

  const clearFilters = () => {
    setSelectedCategory('All');
    setSearchQuery('');
  };

  return (
    <div className="max-w-[1600px] mx-auto px-8 py-12">
      <WardrobeToolbar
        totalCount={wardrobe.length}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categories={FILTER_CATEGORIES}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        onAddClick={() => setIsCreating(true)}
      />

      <WardrobeGrid
        items={filteredItems}
        onSelectItem={setSelectedItemId}
        onDeleteItem={removeItem}
        onClearFilters={clearFilters}
        onDeleteError={showDeleteError}
      />

      {deleteError && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-red-500 text-white px-6 py-3 rounded-full text-sm font-bold shadow-xl animate-in slide-in-from-bottom-5"
        >
          {deleteError}
        </div>
      )}

      {isCreating && (
        <CreateItemModal
          onCreateItem={(newItem) => {
            addItem(newItem);
            setIsCreating(false);
          }}
          onClose={() => setIsCreating(false)}
        />
      )}

      {selectedItem && (
        <ItemDetailEditModal
          key={selectedItem.id}
          item={selectedItem}
          recommendations={recommendedItems}
          categories={EDITABLE_CATEGORIES}
          onClose={() => setSelectedItemId(null)}
          onSelectRecommendation={setSelectedItemId}
          onLogWear={(item) => {
            const today = new Date().toISOString().split('T')[0];
            addOutfit([item], today);
          }}
          onSave={(updated) => updateItem(updated)}
        />
      )}
    </div>
  );
};
