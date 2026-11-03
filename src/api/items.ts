import { request } from './client';

export interface ApiItem {
  embeddingStatus?: 'pending' | 'ready' | 'unavailable' | 'no_image' | 'invalid_image';
  id: string;
  name: string;
  category: string;
  image: string;
  wearCount: number;
  lastWorn: string;
  color: string;
  brand: string;
  addedDate: string;
  postponedUntil?: string;
  cost: number | null;
}

const ITEM_SAVE_TIMEOUT_MS = 30_000;

async function saveItem(path: string, method: 'POST' | 'PUT', item: Partial<ApiItem>) {
  const signal = AbortSignal.timeout(ITEM_SAVE_TIMEOUT_MS);

  try {
    return await request<ApiItem>(path, { method, body: JSON.stringify(item), signal });
  } catch (error) {
    if (signal.aborted) {
      // The server may have saved the item before the response timed out.
      throw new Error('The save timed out. Check your wardrobe before trying again.');
    }
    throw error;
  }
}

export const itemsApi = {
  list: () => request<ApiItem[]>('/items'),
  create: (item: Partial<ApiItem>) =>
    saveItem('/items', 'POST', item),
  update: (id: string, item: Partial<ApiItem>) =>
    saveItem(`/items/${id}`, 'PUT', item),
  remove: (id: string) =>
    request<{ message: string }>(`/items/${id}`, { method: 'DELETE' }),
};
