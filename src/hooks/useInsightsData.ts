import { useMemo } from 'react';
import { ClothingItem, Outfit } from '../types';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const FORGOTTEN_THRESHOLD_DAYS = 30;
const isoDate = (d: Date) => d.toISOString().split('T')[0];

const daysSince = (dateString: string) => {
  const past = new Date(dateString).getTime();
  if (Number.isNaN(past)) return Infinity;
  return Math.ceil(Math.abs(Date.now() - past) / MS_PER_DAY);
};

/**
 * Computes the longest run of consecutive days (ending today or yesterday)
 * on which the user logged at least one outfit.
 */
const computeStreak = (outfits: Outfit[]): number => {
  if (outfits.length === 0) return 0;
  const dates = [...new Set(outfits.map((o) => o.date))].sort().reverse();
  const today = isoDate(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = isoDate(yesterday);

  if (dates[0] !== today && dates[0] !== yesterdayStr) return 0;

  let streak = 1;
  const cursor = new Date(dates[0]);
  cursor.setDate(cursor.getDate() - 1);

  for (let i = 1; i < dates.length; i++) {
    if (dates[i] === isoDate(cursor)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
};

/** Derived stats for the Insights page — kept side-effect free for testability. */
export function useInsightsData(wardrobe: ClothingItem[], outfits: Outfit[]) {
  return useMemo(() => {
    const categoryCounts: Record<string, number> = {};
    wardrobe.forEach((item) => {
      categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
    });
    const categoryData = Object.entries(categoryCounts).map(([name, value]) => ({ name, value }));

    const today = new Date();
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    const startIso = isoDate(startOfMonth);
    const newThisMonth = wardrobe.filter((i) => i.addedDate >= startIso).length;

    const utilization =
      wardrobe.length === 0
        ? 0
        : Math.round((wardrobe.filter((i) => i.wearCount > 0).length / wardrobe.length) * 100);

    const forgottenItems = wardrobe
      .filter((i) => {
        if (i.postponedUntil && new Date(i.postponedUntil) > today) return false;
        return daysSince(i.lastWorn) > FORGOTTEN_THRESHOLD_DAYS;
      })
      .sort((a, b) => new Date(a.lastWorn).getTime() - new Date(b.lastWorn).getTime());

    const mostWorn = wardrobe
      .filter((item) => item.wearCount > 0)
      .sort((a, b) => b.wearCount - a.wearCount || a.name.localeCompare(b.name))
      .slice(0, 6);

    return {
      categoryData,
      streak: computeStreak(outfits),
      utilization,
      newThisMonth,
      forgottenItems,
      mostWorn,
    };
  }, [wardrobe, outfits]);
}

export const insightsHelpers = { daysSince };
