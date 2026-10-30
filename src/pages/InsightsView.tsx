import React, { useState } from 'react';
import { useWardrobe } from '../contexts/WardrobeContext';
import { ClothingItem, Outfit } from '../types';
import { PostponeModal } from '../components/PostponeModal';
import { OutfitDetailModal } from '../components/OutfitDetailModal';
import { ItemDetailModal } from '../components/ItemDetailModal';
import { InsightsHeroStats } from '../components/InsightsHeroStats';
import { ForgottenItemsCard } from '../components/ForgottenItemsCard';
import { CategorySplitChart } from '../components/CategorySplitChart';
import { MostWornCard } from '../components/MostWornCard';
import { RecentOutfitsCard } from '../components/RecentOutfitsCard';
import { useInsightsData } from '../hooks/useInsightsData';

/** Wardrobe analytics dashboard. */
export const InsightsView: React.FC = () => {
  const { wardrobe, outfits, postponeItem } = useWardrobe();
  const {
    categoryData,
    streak,
    utilization,
    newThisMonth,
    forgottenItems,
    mostWorn,
  } = useInsightsData(wardrobe, outfits);

  const [selectedOutfit, setSelectedOutfit] = useState<Outfit | null>(null);
  const [selectedItem, setSelectedItem] = useState<ClothingItem | null>(null);
  const [postponeModalItemId, setPostponeModalItemId] = useState<string | null>(null);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-4">
      <h1 className="text-2xl font-bold text-stone-900 mb-4">Wardrobe Insights</h1>

      <InsightsHeroStats
        totalItems={wardrobe.length}
        newThisMonth={newThisMonth}
        streak={streak}
        utilization={utilization}
      />

      <div className="space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <MostWornCard items={mostWorn} onShowDetails={setSelectedItem} />
          <ForgottenItemsCard items={forgottenItems} onPostpone={setPostponeModalItemId} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)] gap-5">
          <CategorySplitChart data={categoryData} />
          <RecentOutfitsCard
            outfits={outfits}
            wardrobe={wardrobe}
            onSelectOutfit={setSelectedOutfit}
          />
        </div>
      </div>

      {postponeModalItemId && (
        <PostponeModal
          onConfirm={(date) => {
            postponeItem(postponeModalItemId, date);
            setPostponeModalItemId(null);
          }}
          onClose={() => setPostponeModalItemId(null)}
        />
      )}

      {selectedOutfit && (
        <OutfitDetailModal
          outfit={selectedOutfit}
          wardrobe={wardrobe}
          onClose={() => setSelectedOutfit(null)}
        />
      )}

      {selectedItem && (
        <ItemDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
};
