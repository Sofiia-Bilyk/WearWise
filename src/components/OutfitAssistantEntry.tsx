import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useOutfitAssistant } from '../contexts/OutfitAssistantContext';
import { useWardrobe } from '../contexts/WardrobeContext';

export function OutfitAssistantEntry({ variant = 'card', disabled = false }: {
  variant?: 'card' | 'banner'; disabled?: boolean;
}) {
  const { result, busy, openAssistant, date } = useOutfitAssistant();
  const { wardrobe } = useWardrobe();
  const firstLook = result?.looks[0];
  const preview = firstLook?.itemIds.map(id => wardrobe.find(item => item.id === id) ?? firstLook.items.find(item => item.id === id)).filter(Boolean).slice(0, 3) ?? [];
  return <button type="button" disabled={disabled} onClick={openAssistant} aria-haspopup="dialog"
    className={`w-full text-left rounded-xl border border-primary-200 bg-primary-50 p-4 transition hover:border-primary-500 disabled:opacity-40 ${variant === 'banner' ? 'flex flex-wrap items-center gap-x-5 gap-y-2' : 'h-full shadow-sm'}`}>
    <div className="flex items-center gap-2 text-primary-600"><Sparkles size={16} aria-hidden="true" />
      <span className="text-[10px] font-semibold uppercase tracking-wider">AI Recommendations</span></div>
    <div className="flex-1 min-w-0"><p className="font-semibold text-stone-900 mt-1">{firstLook?.title ?? 'What should I wear today?'}</p>
      <p className="text-xs text-stone-600 mt-1">{firstLook ? `Suggested for ${date}` : 'Weather, your plans, and forgotten pieces.'}</p></div>
    {preview.length > 0 && <div className="flex gap-1 mt-2">{preview.map(item => item && <img key={item.id} src={item.image || '/placeholder-garment.svg'} alt={item.name} className="h-9 w-9 rounded-lg object-cover bg-stone-100" />)}</div>}
    <span className="inline-flex items-center gap-2 text-xs font-semibold text-primary-600 mt-2">{busy === 'generate' ? 'Preparing looks…' : 'View recommendations'}<ArrowRight size={14} aria-hidden="true" /></span>
  </button>;
}
