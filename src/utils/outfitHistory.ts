import type { Outfit } from '../types';

export interface OutfitDay {
  date: string;
  outfits: Outfit[];
}

function enteredAt(outfit: Outfit): number {
  const value = outfit.loggedAt ? Date.parse(outfit.loggedAt) : NaN;
  // Missing timestamps belong last; never invent an entry time.
  return Number.isFinite(value) ? value : -Infinity;
}

/** Group by selected wear date, then order actual entry timestamps newest first. */
export function groupOutfitHistory(outfits: Outfit[]): OutfitDay[] {
  const groups = new Map<string, Outfit[]>();
  for (const outfit of outfits) {
    const entries = groups.get(outfit.date) ?? [];
    entries.push(outfit);
    groups.set(outfit.date, entries);
  }
  return [...groups.entries()]
    .sort(([first], [second]) => second.localeCompare(first))
    .map(([date, entries]) => ({
      date,
      outfits: [...entries].sort((first, second) => {
        const firstTime = enteredAt(first);
        const secondTime = enteredAt(second);
        if (firstTime !== secondTime) return firstTime > secondTime ? -1 : 1;
        return second.id.localeCompare(first.id, undefined, { numeric: true });
      }),
    }));
}

export function formatOutfitDay(date: string): string {
  // Interpret the selected calendar day locally, not as UTC midnight.
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

export function formatEntryTime(outfit: Outfit): string {
  if (!outfit.loggedAt) return 'Time unavailable';
  const timestamp = new Date(outfit.loggedAt);
  if (Number.isNaN(timestamp.getTime())) return 'Time unavailable';
  const localDate = [timestamp.getFullYear(),
    String(timestamp.getMonth() + 1).padStart(2, '0'),
    String(timestamp.getDate()).padStart(2, '0')].join('-');
  // Backdated entries show the actual entry date as well as the clock time.
  const options: Intl.DateTimeFormatOptions = localDate === outfit.date
    ? { hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' };
  return new Intl.DateTimeFormat(undefined, options).format(timestamp);
}
