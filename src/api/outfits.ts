import { request } from './client';

export interface ApiOutfit {
  id: string;
  date: string;
  loggedAt?: string | null; // Actual entry timestamp, including its timezone.
  items: string[];
  imagePath: string | null;
}

export const outfitsApi = {
  list: () => request<ApiOutfit[]>('/outfits'),
  create: (itemIds: string[], wornDate: string, image?: File | null): Promise<ApiOutfit> => {
    if (image) {
      const form = new FormData();
      form.append('date', wornDate);
      itemIds.forEach(id => form.append('item_ids', id));
      form.append('image', image);
      return request<ApiOutfit>('/outfits', { method: 'POST', body: form });
    }
    return request<ApiOutfit>('/outfits', {
      method: 'POST',
      body: JSON.stringify({ date: wornDate, item_ids: itemIds }),
    });
  },
};
