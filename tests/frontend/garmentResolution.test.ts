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
