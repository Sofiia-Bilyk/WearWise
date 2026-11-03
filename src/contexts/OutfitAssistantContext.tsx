import React from 'react';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useWardrobe } from './WardrobeContext';
import { outfitAssistantApi as api } from '../api/outfitAssistant';
import type { CalendarEvent, City, DressCode, Suggestions } from '../api/outfitAssistant';
import { readCity, rememberCity, selectedEvents, todayIn, wardrobeVersion } from '../state/outfitAssistant';
import { OutfitAssistantModal } from '../components/OutfitAssistantModal';

type Busy = 'cities' | 'events' | 'connect' | 'disconnect' | 'generate' | null;
interface AssistantState {
  isOpen: boolean; openAssistant: () => void; closeAssistant: () => void;
  status: { aiReady: boolean; calendarReady: boolean; calendarConnected: boolean };
  city: City | null; chooseCity: (city: City) => void;
  date: string; chooseDate: (date: string) => void;
  events: CalendarEvent[]; eventsLoaded: boolean;
  selected: Record<string, DressCode | ''>;
  selectEvent: (id: string, checked: boolean) => void;
  setDressCode: (id: string, code: DressCode | '') => void;
  consent: boolean; setConsent: (value: boolean) => void;
  result: (Suggestions & { generatedAt: string }) | null;
  busy: Busy; error: string;
  searchCities: (query: string) => Promise<City[]>;
  loadEvents: () => Promise<void>;
  connect: () => Promise<void>; disconnect: () => Promise<void>; generate: () => Promise<void>;
}
const AssistantContext = createContext<AssistantState | null>(null);
const EMPTY_STATUS = { aiReady: false, calendarReady: false, calendarConnected: false };

export function OutfitAssistantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Both pages share one account's state. Logout/switching accounts drops it.
  return <AccountAssistant key={user?.id ?? 'guest'} account={user?.id}>{children}</AccountAssistant>;
}

function AccountAssistant({ children, account }: { children: ReactNode; account?: number }) {
  const { wardrobe } = useWardrobe();
  const [city, setCity] = useState<City | null>(() => account ? readCity(account) : null);
  const [date, setDate] = useState(() => city ? todayIn(city.timezone) : '');
  const [isOpen, setOpen] = useState(false);
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [selected, setSelected] = useState<Record<string, DressCode | ''>>({});
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<AssistantState['result']>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const version = wardrobeVersion(wardrobe);
  const latestVersion = useRef(version);
  latestVersion.current = version;

  useEffect(() => { setResult(null); }, [version]);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    if (account) {
      void api.status().then(value => { if (active) setStatus(value); })
        .catch(() => { if (active) setError('Outfit assistance is temporarily unavailable.'); });
      const outcome = new URLSearchParams(window.location.hash.split('?')[1]).get('calendar');
      if (outcome === 'connected' || outcome === 'failed') {
        setOpen(true);
        if (outcome === 'failed') setError('Google Calendar connection was not completed. Please retry.');
      }
    }
    return () => { active = false; mounted.current = false; abort.current?.abort(); };
  }, [account]);

  const clearEvents = () => { setEvents([]); setEventsLoaded(false); setSelected({}); setResult(null); };
  // A page left open overnight must not continue presenting yesterday as today.
  useEffect(() => {
    if (!city) return;
    const tick = () => {
      const today = todayIn(city.timezone);
      if (date < today && !inFlight.current) { setDate(today); clearEvents(); }
    };
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [city, date]);

  async function run<T>(kind: Exclude<Busy, null>, action: (signal: AbortSignal) => Promise<T>,
    apply: (value: T) => void): Promise<T | undefined> {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(kind); setError('');
    const controller = new AbortController(); abort.current = controller;
    try {
      const value = await action(controller.signal);
      if (mounted.current) apply(value);
      return value;
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Please retry.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  const chooseCity = (value: City) => {
    if (inFlight.current) return;
    setCity(value); setDate(todayIn(value.timezone)); clearEvents(); setError('');
    if (account) rememberCity(account, value);
  };
  const generate = async () => {
    if (!city || !date || !consent || !status.aiReady) return;
    let choices;
    try { choices = selectedEvents(selected); } catch (failure) {
      setError((failure as Error).message); return;
    }
    const snapshot = latestVersion.current;
    await run('generate', signal => api.recommend(city.id, date, choices, signal), value => {
      if (snapshot !== latestVersion.current) {
        setResult(null); setError('Your wardrobe changed. Please generate updated suggestions.'); return;
      }
      setResult({ ...value, generatedAt: new Date().toISOString() });
    });
  };

  return <AssistantContext.Provider value={{
    isOpen, openAssistant: () => setOpen(true), closeAssistant: () => setOpen(false),
    status, city, chooseCity, date,
    chooseDate: value => { if (!inFlight.current) { setDate(value); clearEvents(); } },
    events, eventsLoaded, selected, consent, setConsent,
    selectEvent: (id, checked) => {
      if (inFlight.current) return;
      setSelected(previous => { const next = { ...previous }; if (checked) next[id] = ''; else delete next[id]; return next; });
      setResult(null);
    },
    setDressCode: (id, code) => {
      if (inFlight.current) return;
      setSelected(previous => ({ ...previous, [id]: code })); setResult(null);
    },
    result, busy, error,
    searchCities: async query => (await run('cities', signal => api.cities(query, signal), () => {})) ?? [],
    loadEvents: async () => { if (city && date) await run('events', signal => api.events(city.id, date, signal), value => {
      setEvents(value); setEventsLoaded(true); setSelected({}); setResult(null);
    }); },
    connect: async () => { await run('connect', signal => api.connect(signal), value => window.location.assign(value.url)); },
    disconnect: async () => { await run('disconnect', signal => api.disconnect(signal), () => {
      setStatus(previous => ({ ...previous, calendarConnected: false })); clearEvents();
    }); },
    generate,
  }}>
    {children}
    {isOpen && <OutfitAssistantModal />}
  </AssistantContext.Provider>;
}

export function useOutfitAssistant(): AssistantState {
  const value = useContext(AssistantContext);
  if (!value) throw new Error('Use the outfit assistant inside its provider.');
  return value;
}
