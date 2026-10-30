import React from 'react';
import { ArrowUpRight, CalendarClock } from 'lucide-react';

interface InsightsHeroStatsProps {
  totalItems: number;
  newThisMonth: number;
  streak: number;
  utilization: number;
}

/** Top-of-page stat cards: total items, log streak, wardrobe utilization. */
export const InsightsHeroStats: React.FC<InsightsHeroStatsProps> = ({
  totalItems,
  newThisMonth,
  streak,
  utilization,
}) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
    <div className="bg-white p-4 rounded-xl border border-stone-100 shadow-sm border-l-4 border-l-primary-500">
      <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">Total Items</p>
      <p className="text-2xl font-bold text-stone-900 mt-1">{totalItems}</p>
      <div className="flex items-center gap-1 mt-1 text-green-600 text-xs font-medium">
        <ArrowUpRight size={12} aria-hidden="true" />
        <span>+{newThisMonth} this month</span>
      </div>
    </div>

    <div className="bg-white p-4 rounded-xl border border-stone-100 shadow-sm">
      <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">Log Streak</p>
      <p className="text-2xl font-bold text-stone-900 mt-1">{streak} Days</p>
      <div className="flex items-center gap-1 mt-1 text-primary-500 text-xs font-medium">
        <CalendarClock size={12} aria-hidden="true" />
        <span>{streak > 0 ? 'Keep it up!' : 'Start your streak!'}</span>
      </div>
    </div>

    <div className="bg-white p-4 rounded-xl border border-stone-100 shadow-sm border-l-4 border-l-primary-500">
      <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">Utilization</p>
      <p className="text-2xl font-bold text-stone-900 mt-1">{utilization}%</p>
      <div
        role="progressbar"
        aria-valuenow={utilization}
        aria-valuemin={0}
        aria-valuemax={100}
        className="w-full bg-stone-100 h-1.5 rounded-full mt-2 overflow-hidden"
      >
        <div className="bg-primary-500 h-full" style={{ width: `${utilization}%` }} />
      </div>
    </div>
  </div>
);
