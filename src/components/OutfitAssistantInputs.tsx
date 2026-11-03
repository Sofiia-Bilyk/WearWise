import React from 'react';
import { useState } from 'react';
import { useOutfitAssistant } from '../contexts/OutfitAssistantContext';
import type { City, DressCode } from '../api/outfitAssistant';
import { datePlus, todayIn } from '../state/outfitAssistant';

const CODES: Array<[DressCode, string]> = [['professional', 'Professional'], ['smart_casual', 'Smart casual'], ['casual', 'Casual'], ['sport', 'Sport / activewear'], ['formal', 'Formal']];

export function OutfitAssistantInputs() {
  const assistant = useOutfitAssistant();
  const { city, date, busy, status, events, selected } = assistant;
  const [query, setQuery] = useState(city?.name ?? '');
  const [cities, setCities] = useState<City[]>([]);
  const [noCities, setNoCities] = useState(false);
  const today = city ? todayIn(city.timezone) : '';
  const entries = Object.entries(selected);
  const field = 'rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm disabled:opacity-40';
  return <div className="space-y-4 rounded-xl bg-stone-50 p-4">
    <form className="flex flex-wrap gap-2 items-end" onSubmit={async event => { event.preventDefault(); const values = await assistant.searchCities(query); setCities(values); setNoCities(values.length === 0); }}>
      <label className="text-sm">City<input aria-label="Recommendation city" value={query} required minLength={2} maxLength={100} disabled={!!busy} onChange={event => { setQuery(event.target.value); setCities([]); setNoCities(false); }} className={`block ${field}`} /></label>
      <button type="submit" disabled={!!busy} className={field}>Find city</button>
    </form>
    {noCities && <p className="text-sm text-stone-500">No matching city returned. Try another name.</p>}
    {cities.length > 0 && <label className="block text-sm">Choose a location<select aria-label="Choose recommendation location" disabled={!!busy} value={city?.id ?? ''} onChange={event => { const value = cities.find(value => value.id === Number(event.target.value)); if (value) assistant.chooseCity(value); }} className={`block w-full ${field}`}>
      <option value="">Select city</option>{cities.map(value => <option key={value.id} value={value.id}>{value.name}, {value.region}, {value.country}</option>)}
    </select></label>}
    {city && <div className="flex flex-wrap gap-4 items-end"><p className="text-sm">Selected: {city.name}, {city.country}</p>
      <label className="text-sm">Date · {city.timezone}<input aria-label="Recommendation date" type="date" value={date} min={today} max={datePlus(today, 6)} disabled={!!busy} onChange={event => assistant.chooseDate(event.target.value)} className={`block ${field}`} /></label></div>}
    <div className="space-y-2"><h3 className="font-medium">Google Calendar · optional</h3>
      {status.calendarConnected ? <div className="flex gap-2 flex-wrap">
        <button type="button" disabled={!!busy || !city || !date} onClick={() => void assistant.loadEvents()} className={field}>Load this day’s events</button>
        <button type="button" disabled={!!busy || !status.calendarReady} onClick={() => void assistant.connect()} className={field}>Reconnect Google Calendar</button>
        <button type="button" disabled={!!busy} onClick={() => void assistant.disconnect()} className={field}>Disconnect calendar</button>
      </div> : <button type="button" disabled={!!busy || !status.calendarReady} onClick={() => void assistant.connect()} className={field}>Connect Google Calendar</button>}
      {!status.calendarReady && <p className="text-xs text-stone-500">Calendar connection is not available yet. You can still use weather and forgotten items.</p>}
      <p className="text-xs text-stone-500">Choose events to consider and confirm their dress codes. Calendar titles stay out of the AI request.</p>
      {assistant.eventsLoaded && events.length === 0 && <p className="text-sm text-stone-500">No events found for this date.</p>}
      {events.map(event => <div key={event.id} className="bg-white rounded-lg border p-3 space-y-2">
        <label className="flex gap-2 items-start text-sm"><input type="checkbox" checked={event.id in selected} disabled={!!busy || (!(event.id in selected) && entries.length >= 12)} onChange={change => assistant.selectEvent(event.id, change.target.checked)} />
          <span>{event.title}<span className="block text-xs text-stone-500">{event.start.date ? 'All day' : new Date(event.start.dateTime!).toLocaleString(undefined, { timeZone: city!.timezone, dateStyle: 'short', timeStyle: 'short' })}</span></span></label>
        {event.id in selected && <select aria-label={`Dress code for ${event.title}`} disabled={!!busy} value={selected[event.id]} onChange={change => assistant.setDressCode(event.id, change.target.value as DressCode | '')} className={field}>
          <option value="">Confirm dress code</option>{CODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>}
      </div>)}
    </div>
    <label className="flex gap-2 items-start text-xs text-stone-600"><input type="checkbox" checked={assistant.consent} disabled={!!busy} onChange={event => assistant.setConsent(event.target.checked)} />
      <span>Send wardrobe names, categories, colors, forgotten-item flags, weather, and selected event dress codes/times to Anthropic to generate looks. Photos, calendar titles, attendees, account credentials, and exact coordinates are not sent.</span></label>
    {!status.aiReady && <p className="text-sm text-stone-500">Outfit assistance is not available yet.</p>}
    <button type="button" disabled={!!busy || !status.aiReady || !city || !date || date < today || date > datePlus(today, 6) || !assistant.consent || entries.some(([, code]) => !code)} onClick={() => void assistant.generate()}
      className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-semibold disabled:opacity-40">{busy === 'generate' ? 'Preparing looks…' : 'Recommend looks'}</button>
  </div>;
}
