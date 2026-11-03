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
  applySavedSubmission: (result: SubmissionResult, originatingAccount: number) => boolean;
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

  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; refreshVersion.current++; };
  }, []);

  const isCurrentAccount = useCallback((account: number | undefined): account is number =>
    mounted.current && account !== undefined && accountRef.current === account, []);

  const invalidateRefreshes = useCallback(() => {
    refreshVersion.current++;
    // An invalidated initial/background load must not leave loading stuck true.
    setLoading(false);
  }, []);

  const pendingWrites = useRef(new Map<number, number>());

  const refreshWardrobe = useCallback(async (account: number) => {
    if (!isCurrentAccount(account)) return;
    const version = ++refreshVersion.current;
    setLoading(true);
    try {
      const [items, apiOutfits] = await Promise.all([itemsApi.list(), outfitsApi.list()]);
      // Reads taken during a write can contain an incomplete server snapshot.
      if (!isCurrentAccount(account) || refreshVersion.current !== version ||
          (pendingWrites.current.get(account) ?? 0) > 0) return;
      setWardrobe(previous => isCurrentAccount(account) ? items.map(apiItemToClothing) : previous);
      setOutfits(previous => isCurrentAccount(account) ? apiOutfits.map(apiOutfitToOutfit) : previous);
    } catch (error) {
      console.error('Could not refresh wardrobe:', error);
    } finally {
      if (isCurrentAccount(account) && refreshVersion.current === version) setLoading(false);
    }
  }, [isCurrentAccount]);

  const beginWardrobeWrite = useCallback((account: number) => {
    pendingWrites.current.set(account, (pendingWrites.current.get(account) ?? 0) + 1);
    invalidateRefreshes();
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      const remaining = (pendingWrites.current.get(account) ?? 1) - 1;
      if (remaining > 0) pendingWrites.current.set(account, remaining);
      else pendingWrites.current.delete(account);
      if (!isCurrentAccount(account)) return;
      invalidateRefreshes();
      // Recover the full wardrobe after overlapping writes settle, even if a
      // write failed or invalidated the account's initial load.
      if (remaining === 0) void refreshWardrobe(account);
    };
  }, [invalidateRefreshes, isCurrentAccount, refreshWardrobe]);

  // Clear the previous account even if the new account's initial fetch fails.
  useEffect(() => {
    const account = user?.id;
    refreshVersion.current++;
    setWardrobe([]);
    setOutfits([]);
    if (account === undefined) setLoading(false);
    else void refreshWardrobe(account);
    return () => { refreshVersion.current++; };
  }, [user?.id, refreshWardrobe]);

  const applySavedSubmission = useCallback((result: SubmissionResult, originatingAccount: number): boolean => {
    // The provider survives camera navigation. A camera-local ref may be stale
    // after unmount, so enforce ownership here before *any* shared-state update.
    if (!isCurrentAccount(originatingAccount)) return false;
    refreshVersion.current++;
    setOutfits(previous => isCurrentAccount(originatingAccount)
      ? mergeById(previous, [apiOutfitToOutfit(result.outfit)]) : previous);
    setWardrobe(previous => isCurrentAccount(originatingAccount)
      ? mergeById(previous, result.items.map(apiItemToClothing)) : previous);

    // Receipt items are historical; reconcile with current server statistics.
    void refreshWardrobe(originatingAccount);
    return true;
  }, [isCurrentAccount, refreshWardrobe]);

  // Wardrobe Log Wear uses the same endpoint and receipt protection as camera
  // confirmation. Failed attempts keep their exact UUID until retried/resolved.
  const quickSave = useRef<{ account: number; signature: string; payload: OutfitSubmission;
    photo: File | null; inFlight: boolean } | null>(null);
  const addOutfit = useCallback(async (items: ClothingItem[], date: string, image?: File | null) => {
    const account = user?.id;
    if (!isCurrentAccount(account)) throw new Error('Sign in before logging wear.');
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
      if (!applySavedSubmission(result, account)) return;
      clearReceipt(account, attempt.payload.submissionId);
      quickSave.current = null;
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : 'Could not confirm saving.'} Retry Log Wear, or open Log a look to check save status.`);
    } finally {
      attempt.inFlight = false;
    }
  }, [user?.id, applySavedSubmission, isCurrentAccount]);

  const updateItem = useCallback(async (updatedItem: ClothingItem) => {
    const account = user?.id;
    if (!isCurrentAccount(account)) throw new Error('Sign in before editing an item.');
    const finishWrite = beginWardrobeWrite(account);
    try {
      const apiItem = await itemsApi.update(updatedItem.id, {
        name: updatedItem.name, category: updatedItem.category, color: updatedItem.color,
        brand: updatedItem.brand, cost: updatedItem.cost, image: updatedItem.image,
        postponedUntil: updatedItem.postponedUntil ?? null,
      });
      if (!isCurrentAccount(account)) return;
      setWardrobe(previous => isCurrentAccount(account)
        ? previous.map(item => item.id === updatedItem.id ? apiItemToClothing(apiItem) : item) : previous);
    } finally {
      // Also invalidate reads started while the write was pending, including
      // failed writes whose server outcome may not be known to this client.
      finishWrite();
    }
  }, [user?.id, isCurrentAccount, beginWardrobeWrite]);

  const addItem = useCallback(async (newItem: ClothingItem): Promise<ClothingItem> => {
    const account = user?.id;
    if (!isCurrentAccount(account)) throw new Error('Sign in before adding an item.');
    const finishWrite = beginWardrobeWrite(account);
    try {
      const apiItem = await itemsApi.create({
        name: newItem.name, category: newItem.category, color: newItem.color,
        brand: newItem.brand, cost: newItem.cost, image: newItem.image,
      });
      const clothingItem = apiItemToClothing(apiItem);
      if (isCurrentAccount(account)) {
        setWardrobe(previous => isCurrentAccount(account)
          ? mergeById(previous, [clothingItem]) : previous);
      }
      return clothingItem;
    } finally {
      finishWrite();
    }
  }, [user?.id, isCurrentAccount, beginWardrobeWrite]);

  const removeItem = useCallback(async (id: string) => {
    const account = user?.id;
    if (!isCurrentAccount(account)) throw new Error('Sign in before removing an item.');
    const finishWrite = beginWardrobeWrite(account);
    try {
      await itemsApi.remove(id);
      if (!isCurrentAccount(account)) return;
      setWardrobe(previous => isCurrentAccount(account) ? previous.filter(item => item.id !== id) : previous);
    } finally {
      finishWrite();
    }
  }, [user?.id, isCurrentAccount, beginWardrobeWrite]);

  const postponeItem = useCallback(async (itemId: string, date: string) => {
    const account = user?.id;
    if (!isCurrentAccount(account)) return;
    const finishWrite = beginWardrobeWrite(account);
    try {
      const apiItem = await itemsApi.update(itemId, { postponedUntil: date });
      if (!isCurrentAccount(account)) return;
      const clothingItem = apiItemToClothing(apiItem);
      setWardrobe(previous => isCurrentAccount(account)
        ? previous.map(item => item.id === itemId ? clothingItem : item) : previous);
    } catch (error) {
      console.error('Failed to postpone item reminder:', error);
    } finally {
      finishWrite();
    }
  }, [user?.id, isCurrentAccount, beginWardrobeWrite]);

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
