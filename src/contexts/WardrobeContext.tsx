import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { ClothingItem, Outfit } from '../types';
import { itemsApi } from '../api/items';
import { outfitsApi } from '../api/outfits';
import { apiItemToClothing, apiOutfitToOutfit } from '../api/adapters';
import { useAuth } from './AuthContext';

// ── Context ───────────────────────────────────────────────────────────────────
interface WardrobeContextType {
  wardrobe: ClothingItem[];
  outfits: Outfit[];
  loading: boolean;
  addOutfit: (items: ClothingItem[], date: string, image?: File | null) => Promise<void>;
  updateItem: (item: ClothingItem) => Promise<void>;
  addItem: (item: ClothingItem) => Promise<ClothingItem>;
  removeItem: (id: string) => Promise<void>;
  postponeItem: (itemId: string, date: string) => void;
}

const WardrobeContext = createContext<WardrobeContextType | undefined>(undefined);

export const WardrobeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [wardrobe, setWardrobe] = useState<ClothingItem[]>([]);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [loading, setLoading] = useState(false);

  // Load wardrobe + outfits whenever the user logs in
  useEffect(() => {
    if (!user) {
      setWardrobe([]);
      setOutfits([]);
      return;
    }
    setLoading(true);
    Promise.all([itemsApi.list(), outfitsApi.list()])
      .then(([items, apiOutfits]) => {
        setWardrobe(items.map(apiItemToClothing));
        setOutfits(apiOutfits.map(apiOutfitToOutfit));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  const addOutfit = useCallback(async (items: ClothingItem[], date: string, image?: File | null) => {
    const apiOutfit = await outfitsApi.create(items.map(i => i.id), date, image);
    const outfit = apiOutfitToOutfit(apiOutfit);
    setOutfits(prev => [outfit, ...prev]);

    // Update wear counts locally (re-fetch would also work)
    setWardrobe(prev => prev.map(item => {
      if (items.find(i => i.id === item.id)) {
        return { ...item, wearCount: item.wearCount + 1, lastWorn: date };
      }
      return item;
    }));
  }, []);

  const updateItem = useCallback(async (updatedItem: ClothingItem) => {
    const apiItem = await itemsApi.update(updatedItem.id, {
      name: updatedItem.name,
      category: updatedItem.category,
      color: updatedItem.color,
      brand: updatedItem.brand,
      cost: updatedItem.cost,
      image: updatedItem.image,
      postponedUntil: updatedItem.postponedUntil ?? null,
    });
    setWardrobe(prev => prev.map(item => item.id === updatedItem.id ? apiItemToClothing(apiItem) : item));
  }, []);

  const addItem = useCallback(async (newItem: ClothingItem): Promise<ClothingItem> => {
    const apiItem = await itemsApi.create({
      name: newItem.name,
      category: newItem.category,
      color: newItem.color,
      brand: newItem.brand,
      cost: newItem.cost,
      image: newItem.image,
    });
    const clothingItem = apiItemToClothing(apiItem);
    setWardrobe(prev => [clothingItem, ...prev]);
    return clothingItem;
  }, []);

  const removeItem = useCallback(async (id: string) => {
    await itemsApi.remove(id);
    setWardrobe(prev => prev.filter(item => item.id !== id));
  }, []);

  // Persists a "remind me later" date so the item drops out of the
  // forgotten-items list until the chosen date.
  const postponeItem = useCallback(async (itemId: string, date: string) => {
    try {
      const apiItem = await itemsApi.update(itemId, { postponedUntil: date });
      const clothingItem = apiItemToClothing(apiItem);
      setWardrobe(prev => prev.map(item => item.id === itemId ? clothingItem : item));
    } catch (err) {
      console.error('Failed to postpone item reminder:', err);
    }
  }, []);

  return (
    <WardrobeContext.Provider value={{ wardrobe, outfits, loading, addOutfit, updateItem, addItem, removeItem, postponeItem }}>
      {children}
    </WardrobeContext.Provider>
  );
};

export const useWardrobe = () => {
  const ctx = useContext(WardrobeContext);
  if (!ctx) throw new Error('useWardrobe must be used within a WardrobeProvider');
  return ctx;
};
