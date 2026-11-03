import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareSubmission, mergeById, saveReceipt, readReceipt, clearReceipt } from '../../src/state/outfitSubmission.ts';
import { beginDraft, resolveDraft } from '../../src/state/garmentResolution.ts';

const item = (id: string) => ({ id, name: `Item ${id}`, category: 'Top' as const, color: 'Blue', image: '',
  wearCount: 0, lastWorn: 'Never', addedDate: '2026-11-01' });

test('submission snapshots choices and sends only writable new-item fields', () => {
  const existing = item('7');
  const added = item('new');
  let draft = beginDraft([{ ...item('crop-1'), matchedItemId: '7' }, item('crop-2')], [existing]);
  draft = resolveDraft(draft, 'crop-2', { kind: 'new', item: added });
  const submission = prepareSubmission(draft, [existing], '2026-11-01', 'receipt-1');
  added.name = 'Changed after confirmation';
  assert.deepEqual(submission.entries[0], { kind: 'existing', itemId: '7' });
  const entry = submission.entries[1];
  assert.equal(entry.kind, 'new');
  if (entry.kind !== 'new') throw new Error('Expected new item');
  assert.equal(entry.item.name, 'Item new');
  assert.equal('id' in entry.item, false);
  assert.equal('wearCount' in entry.item, false);
  assert.equal(submission.submissionId, 'receipt-1');
});

test('invalid drafts fail before a submission is sent', () => {
  assert.throws(() => prepareSubmission(beginDraft([item('d1')], []), [], '2026-11-01', 'receipt'), /identify/);
  assert.throws(() => prepareSubmission([], [], 'invalid', 'receipt'), /date/);
});

test('replaying a save replaces records without duplicating outfits or wear counts', () => {
  const old = [{ id: '7', wearCount: 2 }, { id: '8', wearCount: 0 }];
  const response = [{ id: '7', wearCount: 3 }, { id: '9', wearCount: 1 }];
  const first = mergeById(old, response);
  const replay = mergeById(first, response);
  assert.deepEqual(replay, first);
  assert.equal(replay.length, 3);
  assert.equal(replay.find(item => item.id === '7')?.wearCount, 3);
  assert.equal(old[0].wearCount, 2);
});

test('receipt storage is account scoped and contains no photo or draft', () => {
  const store = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    setItem: (key: string, value: string) => store.set(key, value),
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => store.delete(key),
  } });
  try {
    saveReceipt(1, 'attempt-a');
    saveReceipt(2, 'attempt-b');
    assert.equal(readReceipt(1), 'attempt-a');
    assert.equal(readReceipt(2), 'attempt-b');
    clearReceipt(1);
    assert.equal(readReceipt(1), null);
    assert.equal(readReceipt(2), 'attempt-b');
    assert.deepEqual([...store.values()], ['attempt-b']);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});
