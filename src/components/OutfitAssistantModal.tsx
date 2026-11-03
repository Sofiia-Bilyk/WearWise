import React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useOutfitAssistant } from '../contexts/OutfitAssistantContext';
import { useWardrobe } from '../contexts/WardrobeContext';
import { OutfitAssistantInputs } from './OutfitAssistantInputs';

/** One native dialog for both entry points; merely viewing it never calls AI. */
export function OutfitAssistantModal() {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const { result, busy, error, closeAssistant, date } = useOutfitAssistant();
  const { wardrobe } = useWardrobe();
  const [showInputs, setShowInputs] = useState(!result);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  useEffect(() => { if (result) setShowInputs(false); else setShowInputs(true); }, [result]);
  return <dialog ref={dialog} aria-labelledby={title} onCancel={event => { event.preventDefault(); closeAssistant(); }}
    className="w-[calc(100%_-_2rem)] max-w-6xl max-h-[90dvh] overflow-y-auto rounded-2xl bg-white p-0 backdrop:bg-stone-900/60">
    <header className="flex justify-between items-start gap-4 border-b p-5 sticky top-0 bg-white z-10">
      <div><h2 id={title} className="text-2xl font-semibold">Your recommended looks</h2>
        <p className="text-sm text-stone-500 mt-1">Ideas from your wardrobe for {date || 'the day ahead'}.</p></div>
      <button type="button" aria-label="Close outfit recommendations" onClick={closeAssistant}><X aria-hidden="true" /></button>
    </header>
    <div className="p-5 space-y-4">
      {result && <button type="button" disabled={!!busy} onClick={() => setShowInputs(value => !value)} className="text-sm font-medium text-primary-600 disabled:opacity-40">{showInputs ? 'Hide settings' : 'Change inputs or refresh suggestions'}</button>}
      {showInputs && <OutfitAssistantInputs />}
      {busy && <p role="status" className="text-sm text-stone-600">{busy === 'generate' ? 'Considering weather, your plans, and forgotten pieces…' : 'Loading…'}</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {result && <div aria-live="polite" className="space-y-4">
        <p className="text-xs text-stone-500">Generated {new Date(result.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Suggestions do not create wear logs.</p>
        {result.weather && <p className="text-sm text-stone-600">Forecast: {Math.min(...result.weather.hours.map(hour => hour.temperature_2m))}–{Math.max(...result.weather.hours.map(hour => hour.temperature_2m))}°C; rain chance up to {Math.max(...result.weather.hours.map(hour => hour.precipitation_probability))}%.</p>}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">{result.looks.map((look, index) => <article key={index} className="rounded-xl border border-stone-200 p-4">
          <h3 className="font-semibold text-lg">{look.title}</h3>
          <div className="grid grid-cols-2 gap-2 my-3">{look.itemIds.map(id => {
            const item = wardrobe.find(value => value.id === id) ?? look.items.find(value => value.id === id);
            return item && <figure key={id}><img src={item.image || '/placeholder-garment.svg'} alt={item.name} className="w-full aspect-square rounded-lg object-cover bg-stone-100" />
              <figcaption className="text-xs mt-1">{item.name}{look.forgottenItemIds.includes(id) && <span className="block text-primary-600 font-medium">Forgotten piece</span>}</figcaption></figure>;
          })}</div>
          <dl className="space-y-3 text-sm"><div><dt className="font-semibold">Weather</dt><dd>{look.weatherReason}</dd></div>
            <div><dt className="font-semibold">Your plans</dt><dd>{look.calendarReason}</dd></div>
            <div><dt className="font-semibold">Rediscover</dt><dd>{look.forgottenReason}</dd></div></dl>
        </article>)}</div>
        {result.notes.map((note, index) => <p key={index} className="text-xs text-stone-600">{note}</p>)}
      </div>}
      <p className="text-xs text-stone-500">Weather: <a href="https://open-meteo.com/" className="underline">Open-Meteo</a>. City data: <a href="https://www.geonames.org/" className="underline">GeoNames</a>.</p>
    </div>
  </dialog>;
}
