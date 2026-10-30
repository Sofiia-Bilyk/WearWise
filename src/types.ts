export type Category = 'Top' | 'Bottom' | 'Shoes' | 'Outerwear' | 'Accessory';

export interface ClothingItem {
  id: string;
  name: string;
  category: Category;
  image: string;
  wearCount: number;
  lastWorn: string; // ISO Date string
  color: string;
  brand?: string;
  addedDate: string;
  postponedUntil?: string; // ISO Date string
  cost?: number;
}

export interface Outfit {
  id: string;
  date: string;
  items: string[]; // Array of ClothingItem IDs
}

export interface StatMetric {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export interface ChartData {
  name: string;
  value: number;
}