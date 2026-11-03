import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayIn, datePlus, selectedEvents, wardrobeVersion, readCity, rememberCity } from '../../src/state/outfitAssistant.ts';

const item = (id: string) => ({ id, name: 'Top', category: 'Top' as const, color: 'Blue', image: '',
  wearCount: 0, lastWorn: '2026-10-01', addedDate: '2026-09-01' });

test('city dates use the selected timezone and calendar arithmetic crosses years', () => {
  assert.match(todayIn('America/Los_Angeles'), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(datePlus('2026-12-29', 6), '2027-01-04');
  assert.equal(datePlus('2026-10-30', 6), '2026-11-05');
});
test('calendar choices require confirmed dress codes and enforce the selection limit', () => {
  assert.throws(() => selectedEvents({ event: '' }), /confirm/);
  assert.deepEqual(selectedEvents({ b: 'sport', a: 'professional' }), [
    { id: 'a', dressCode: 'professional' }, { id: 'b', dressCode: 'sport' },
  ]);
  assert.throws(() => selectedEvents(Object.fromEntries(Array.from({ length: 13 }, (_, i) => [String(i), 'formal']))), /12/);
});
test('wardrobe fingerprint is reorder stable and invalidates relevant changes', () => {
  const first = item('1'), second = item('2');
  assert.equal(wardrobeVersion([first, second]), wardrobeVersion([second, first]));
  for (const change of [{ name: 'New name' }, { wearCount: 1 }, { image: 'new.jpg' }, { postponedUntil: '2026-12-01' }]) {
    assert.notEqual(wardrobeVersion([first]), wardrobeVersion([{ ...first, ...change }]));
  }
});
test('city preferences are account scoped and corrupted/blocked storage is safe', () => {
  const store = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    setItem: (key: string, value: string) => store.set(key, value),
    getItem: (key: string) => store.get(key) ?? null,
  } });
  try {
    const city = { id: 1, name: 'City', country: 'Country', region: 'Region', timezone: 'UTC' };
    rememberCity(1, city);
    assert.deepEqual(readCity(1), city);
    assert.equal(readCity(2), null);
    store.set('wearwise:assistant-city:1', '{invalid');
    assert.equal(readCity(1), null);
    store.set('wearwise:assistant-city:1', JSON.stringify({ ...city, timezone: 'not/a/zone' }));
    assert.equal(readCity(1), null);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});
