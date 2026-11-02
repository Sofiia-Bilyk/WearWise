import type { City, DressCode } from '../api/outfitAssistant';
import type { ClothingItem } from '../types';

export function todayIn(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function datePlus(day: string, days: number): string {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function wardrobeVersion(wardrobe: ClothingItem[]): string {
  // Stable across response reordering; ignores unrelated costs/brands.
  return JSON.stringify([...wardrobe].sort((a, b) => a.id.localeCompare(b.id)).map(item => ({
    id: item.id, name: item.name, category: item.category, color: item.color, image: item.image,
    lastWorn: item.lastWorn, wearCount: item.wearCount, postponedUntil: item.postponedUntil,
  })));
}

export function selectedEvents(selected: Record<string, DressCode | ''>) {
  const entries = Object.entries(selected);
  if (entries.length > 12 || entries.some(([, code]) => !code)) {
    throw new Error('Choose up to 12 events and confirm each dress code.');
  }
  return entries.sort(([first], [second]) => first.localeCompare(second))
    .map(([id, dressCode]) => ({ id, dressCode: dressCode as DressCode }));
}

const cityKey = (account: number) => `wearwise:assistant-city:${account}`;
export function readCity(account: number): City | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(cityKey(account)) ?? 'null');
    if (!value || !Number.isInteger(value.id) || value.id <= 0 ||
      ['name', 'country', 'region', 'timezone'].some(key => typeof value[key] !== 'string' || value[key].length > 160)) return null;
    todayIn(value.timezone);
    return value;
  } catch { return null; }
}
export function rememberCity(account: number, city: City) {
  // City preference only; no calendar events, API keys, photos, or OAuth tokens.
  try { sessionStorage.setItem(cityKey(account), JSON.stringify(city)); } catch { /* Memory-only operation still works. */ }
}
