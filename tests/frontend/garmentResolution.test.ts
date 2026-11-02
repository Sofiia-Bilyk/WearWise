import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beginDraft, resolveDraft, isDraftReady, buildSavePlan } from '../../src/state/garmentResolution.ts';

const item = (id: string) => ({ id, name: `Item ${id}`, category: 'Top' as const, image: '', color: 'Blue', wearCount: 0, lastWorn: 'Never', addedDate: '2026-11-01' });

test('recognizes only explicitly matched IDs available in the user wardrobe', () => {
  const draft = beginDraft([{ ...item('d1'), matchedItemId: '7' }, { ...item('d2'), matchedItemId: 'foreign' }, item('d3')], [item('7')]);
  assert.deepEqual(draft.map(row => row.resolution), [{ kind: 'existing', itemId: '7' }, null, null]);
});
test('unmatched crops resolve sequentially and require whole-log confirmation', () => {
  let draft = beginDraft([item('d1'), item('d2')], []);
  assert.equal(isDraftReady(draft), false);
  draft = resolveDraft(draft, 'd1', { kind: 'new', item: item('new') });
  assert.equal(draft.find(row => !row.resolution)?.detection.id, 'd2');
  assert.equal(isDraftReady(draft), false);
  draft = resolveDraft(draft, 'd2', { kind: 'existing', itemId: '7' });
  assert.equal(isDraftReady(draft), true);
});
test('preserves the detected crop when selecting an existing item', () => {
  const detection = { ...item('d1'), image: 'original-crop' };
  const draft = resolveDraft(beginDraft([detection], []), 'd1', { kind: 'existing', itemId: '7' });
  assert.equal(draft[0].detection.image, 'original-crop');
});
test('correcting a choice makes it unresolved again', () => {
  const draft = beginDraft([{ ...item('d1'), matchedItemId: '7' }], [item('7')]);
  assert.equal(isDraftReady(resolveDraft(draft, 'd1', null)), false);
});
test('final plan deduplicates repeated existing wardrobe IDs', () => {
  const draft = beginDraft([{ ...item('d1'), matchedItemId: '7' }, { ...item('d2'), matchedItemId: '7' }], [item('7')]);
  assert.equal(buildSavePlan(draft, [item('7')]).length, 1);
});
test('existing and new selections produce the correct save plan', () => {
  let draft = beginDraft([{ ...item('d1'), matchedItemId: '7' }, item('d2')], [item('7')]);
  draft = resolveDraft(draft, 'd2', { kind: 'new', item: item('new') });
  assert.deepEqual(buildSavePlan(draft, [item('7')]).map(row => row.kind), ['existing', 'new']);
});
test('unresolved, empty, and unavailable-item drafts cannot be saved', () => {
  assert.equal(isDraftReady([]), false);
  assert.throws(() => buildSavePlan([], []), /identify every item/);
  assert.throws(() => buildSavePlan(beginDraft([item('d1')], []), []), /identify every item/);
  const draft = beginDraft([{ ...item('d1'), matchedItemId: '7' }], [item('7')]);
  assert.throws(() => buildSavePlan(draft, []), /unavailable/);
});
test('new detections start a fresh queue without carrying previous decisions', () => {
  const previous = resolveDraft(beginDraft([item('d1')], []), 'd1', { kind: 'new', item: item('new') });
  assert.equal(isDraftReady(previous), true);
  assert.equal(beginDraft([item('d2')], [])[0].resolution, null);
});

test('retry reuses a successfully created item after a later save failure', () => {
  let draft = resolveDraft(beginDraft([item('d1'), item('d2')], []), 'd1', {
    kind: 'new', item: item('first-choice'),
  });
  draft = resolveDraft(draft, 'd2', { kind: 'new', item: item('second-choice') });

  // The first creation succeeded, but the next request failed.
  const created = item('saved-7');
  draft = resolveDraft(draft, 'd1', { kind: 'existing', itemId: created.id });
  const retry = buildSavePlan(draft, [created]);

  assert.deepEqual(retry.map(entry => [entry.kind, entry.item.id]), [
    ['existing', 'saved-7'], ['new', 'second-choice'],
  ]);
});

test('retry keeps a replacement new choice even when the earlier created item is available', () => {
  const created = item('saved-7');
  let draft = resolveDraft(beginDraft([item('d1')], []), 'd1', {
    kind: 'existing', itemId: created.id,
  });

  // After an outfit save failed, the user changes the same row to a new garment.
  draft = resolveDraft(draft, 'd1', null);
  const replacement = { ...item('replacement'), name: 'Replacement coat', image: 'replacement-photo' };
  draft = resolveDraft(draft, 'd1', { kind: 'new', item: replacement });
  const retry = buildSavePlan(draft, [created]);

  assert.equal(retry[0].detectionId, 'd1');
  assert.equal(retry[0].kind, 'new');
  assert.deepEqual(retry[0].item, replacement);
  assert.notEqual(retry[0].item.id, created.id);
});
