import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupOutfitHistory, formatEntryTime, formatOutfitDay } from '../../src/utils/outfitHistory.ts';
import type { Outfit } from '../../src/types';

const outfit = (id: string, date: string, loggedAt?: string | null): Outfit => ({ id, date, loggedAt, items: [] });

test('groups repeated days and sorts dates newest first without mutating input', () => {
  const source = [outfit('1', '2026-10-30'), outfit('2', '2026-11-01'), outfit('3', '2026-10-30')];
  const original = [...source];
  const days = groupOutfitHistory(source);
  assert.deepEqual(days.map(day => day.date), ['2026-11-01', '2026-10-30']);
  assert.equal(days[1].outfits.length, 2);
  assert.deepEqual(source, original);
});
test('sorts actual entry instants, including different timezone offsets', () => {
  const days = groupOutfitHistory([
    outfit('1', '2026-11-01', '2026-11-01T10:00:00-08:00'),
    outfit('2', '2026-11-01', '2026-11-01T18:30:00+00:00'),
  ]);
  assert.deepEqual(days[0].outfits.map(item => item.id), ['2', '1']);
});
test('keeps backdated outfits under the selected wear date', () => {
  const days = groupOutfitHistory([outfit('1', '2026-10-01', '2026-11-01T20:00:00Z')]);
  assert.equal(days[0].date, '2026-10-01');
});
test('puts missing or invalid times last and breaks ties by numeric ID', () => {
  const days = groupOutfitHistory([
    outfit('2', '2026-11-01', null), outfit('10', '2026-11-01', 'invalid'),
    outfit('1', '2026-11-01', '2026-11-01T20:00:00Z'),
  ]);
  assert.deepEqual(days[0].outfits.map(item => item.id), ['1', '10', '2']);
});
test('empty history returns no groups', () => assert.deepEqual(groupOutfitHistory([]), []));
test('missing timestamps display an explicit fallback', () => {
  assert.equal(formatEntryTime(outfit('1', '2026-11-01')), 'Time unavailable');
  assert.equal(formatEntryTime(outfit('1', '2026-11-01', 'invalid')), 'Time unavailable');
});
test('formats local times and preserves calendar dates across timezone boundaries', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    const sameDay = outfit('1', '2026-11-01', '2026-11-01T20:00:00Z');
    const expected = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(sameDay.loggedAt!));
    assert.equal(formatEntryTime(sameDay), expected);
    const backdated = outfit('2', '2026-10-31', sameDay.loggedAt);
    assert.notEqual(formatEntryTime(backdated), expected);
    assert.equal(formatOutfitDay('2026-11-01'), new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(2026, 10, 1)));
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
test('orders repeated daylight-saving clock hours by their actual instants', () => {
  const days = groupOutfitHistory([
    outfit('1', '2026-11-01', '2026-11-01T01:30:00-07:00'),
    outfit('2', '2026-11-01', '2026-11-01T01:30:00-08:00'),
  ]);
  assert.deepEqual(days[0].outfits.map(item => item.id), ['2', '1']);
});
