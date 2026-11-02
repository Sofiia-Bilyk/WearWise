import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { ClothingItem, Outfit } from '../types';
import { itemsApi } from '../api/items';
import { outfitsApi } from '../api/outfits';
import type { SubmissionResult } from '../api/outfits';
import { mergeById, readReceipt, saveReceipt, clearReceipt } from '../state/outfitSubmission';
import type { OutfitSubmission } from '../state/outfitSubmission';
import { apiItemToClothing, apiOutfitToOutfit } from '../api/adapters';
import { useAuth } from './AuthContext';

// ── Context ───────────────────────────────────────────────────────────────────
interface WardrobeContextType {
  wardrobe: ClothingItem[];
  outfits: Outfit[];
  loading: boolean;
  applySavedSubmission: (result: SubmissionResult) => void;
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

  const accountRef = useRef(user?.id);
  accountRef.current = user?.id;
  const refreshVersion = useRef(0);

  // Load wardrobe + outfits whenever the user logs in
  useEffect(() => {
    let active = true;
    const version = ++refreshVersion.current;
    if (!user) {
      setWardrobe([]);
      setOutfits([]);
      return;
    }
    setLoading(true);
    Promise.all([itemsApi.list(), outfitsApi.list()])
      .then(([items, apiOutfits]) => {
        if (!active || version !== refreshVersion.current) return;
        setWardrobe(items.map(apiItemToClothing));
        setOutfits(apiOutfits.map(apiOutfitToOutfit));
      })
      .catch(console.error)
      .finally(() => { if (active && version === refreshVersion.current) setLoading(false); });
    return () => { active = false; };
  }, [user]);

  const applySavedSubmission = useCallback((result: SubmissionResult) => {
    setOutfits(previous => mergeById(previous, [apiOutfitToOutfit(result.outfit)]));
    setWardrobe(previous => mergeById(previous, result.items.map(apiItemToClothing)));
    // Durable receipts describe the original save. Fetch current statistics
    // after replay so later wear logs or item edits are not replaced by history.
    const account = accountRef.current;
    const version = ++refreshVersion.current;
    void Promise.all([itemsApi.list(), outfitsApi.list()]).then(([items, outfits]) => {
      if (accountRef.current !== account || refreshVersion.current !== version) return;
      setWardrobe(items.map(apiItemToClothing));
      setOutfits(outfits.map(apiOutfitToOutfit));
    }).catch(console.error).finally(() => {
      if (accountRef.current === account && refreshVersion.current === version) setLoading(false);
    });
  }, []);

  // Wardrobe Log Wear uses the same endpoint and receipt protection as camera
  // confirmation. Failed attempts keep their exact UUID until retried/resolved.
  const quickSave = useRef<{ account: number; signature: string; payload: OutfitSubmission;
    photo: File | null; inFlight: boolean } | null>(null);
  const addOutfit = useCallback(async (items: ClothingItem[], date: string, image?: File | null) => {
    if (!user) throw new Error('Sign in before logging wear.');
    const account = user.id;
    const ids = [...new Set(items.map(item => item.id))].sort();
    const signature = JSON.stringify({ ids, date });
    const receipt = readReceipt(account);
    if (quickSave.current?.inFlight) throw new Error('A save is already in progress.');
    if (quickSave.current?.account !== account || quickSave.current?.payload.submissionId !== receipt) {
      quickSave.current = null;
    }
    if (!quickSave.current) {
      if (receipt) throw new Error('Open Log a look to check the previous save before logging another wear.');
      const payload: OutfitSubmission = { submissionId: crypto.randomUUID(), date,
        entries: ids.map(itemId => ({ kind: 'existing', itemId })) };
      saveReceipt(account, payload.submissionId);
      quickSave.current = { account, signature, payload, photo: image ?? null, inFlight: false };
    }
    const attempt = quickSave.current;
    if (attempt.signature !== signature || attempt.photo !== (image ?? null)) {
      throw new Error('Open Log a look to check the previous save before changing the log.');
    }
    attempt.inFlight = true;
    try {
      const result = await outfitsApi.submit(attempt.payload, attempt.photo);
      if (accountRef.current !== account) return;
      applySavedSubmission(result);
      clearReceipt(account);
      quickSave.current = null;
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : 'Could not confirm saving.'} Retry Log Wear, or open Log a look to check save status.`);
    } finally {
      attempt.inFlight = false;
    }
  }, [user?.id, applySavedSubmission]);

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
    <WardrobeContext.Provider value={{ wardrobe, outfits, loading, applySavedSubmission, addOutfit, updateItem, addItem, removeItem, postponeItem }}>
      {children}
    </WardrobeContext.Provider>
  );
};

export const useWardrobe = () => {
  const ctx = useContext(WardrobeContext);
  if (!ctx) throw new Error('useWardrobe must be used within a WardrobeProvider');
  return ctx;
};
