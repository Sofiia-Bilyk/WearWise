import { request } from './client';
import type { ApiItem } from './items';

export interface City {
  id: number; name: string; country: string; region: string; timezone: string;
}
export interface CalendarEvent {
  id: string; title: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
}
export type DressCode = 'professional' | 'smart_casual' | 'casual' | 'sport' | 'formal';
export interface RecommendedLook {
  title: string; itemIds: string[]; items: ApiItem[]; forgottenItemIds: string[];
  weatherReason: string; calendarReason: string; forgottenReason: string;
}
export interface Suggestions {
  looks: RecommendedLook[]; notes: string[];
  weather: null | { timezone: string; temperatureUnit: string; windUnit: string;
    source: string; hours: Array<{ time: string; temperature_2m: number;
      apparent_temperature: number; precipitation_probability: number;
      wind_speed_10m: number; relative_humidity_2m: number }> };
}

const bounded = (signal: AbortSignal | undefined, timeout: number) =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
const jsonPost = <T>(path: string, data: unknown, signal?: AbortSignal, timeout = 15000) => request<T>(path, {
  method: 'POST', body: JSON.stringify(data), signal: bounded(signal, timeout),
});
export const outfitAssistantApi = {
  status: () => request<{ aiReady: boolean; calendarReady: boolean; calendarConnected: boolean }>(
    '/outfit-assistant/status', { signal: bounded(undefined, 15000) }),
  cities: (query: string, signal?: AbortSignal) => request<City[]>(`/outfit-assistant/cities?q=${encodeURIComponent(query)}`, { signal: bounded(signal, 15000) }),
  events: (cityId: number, date: string, signal?: AbortSignal) => request<CalendarEvent[]>(
    `/outfit-assistant/events?cityId=${cityId}&date=${encodeURIComponent(date)}`, { signal: bounded(signal, 75000) }),
  connect: (signal?: AbortSignal) => jsonPost<{ url: string }>('/calendar/google/connect', {}, signal),
  disconnect: (signal?: AbortSignal) => jsonPost('/calendar/google/disconnect', {}, signal),
  recommend: (cityId: number, date: string, selectedEvents: Array<{ id: string; dressCode: DressCode }>, signal?: AbortSignal) =>
    jsonPost<Suggestions>('/outfit-assistant/recommendations', { cityId, date, selectedEvents, shareWithAnthropic: true }, signal, 120000),
};
