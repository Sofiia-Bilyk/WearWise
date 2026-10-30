import { request } from './client';

export interface ApiItem {
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

export const itemsApi = {
  list: () => request<ApiItem[]>('/items'),
  create: (item: Partial<ApiItem>) =>
    request<ApiItem>('/items', { method: 'POST', body: JSON.stringify(item) }),
  update: (id: string, item: Partial<ApiItem>) =>
    request<ApiItem>(`/items/${id}`, { method: 'PUT', body: JSON.stringify(item) }),
  remove: (id: string) =>
    request<{ message: string }>(`/items/${id}`, { method: 'DELETE' }),
};
