
import React, { act, useState } from 'react';
import { before, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3000/' });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
  navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement,
  sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}

type Wardrobe = ReturnType<typeof import('../../src/contexts/WardrobeContext').useWardrobe>;
type Auth = ReturnType<typeof import('../../src/contexts/AuthContext').useAuth>;
let modules: any;
let root: any;
let container: HTMLDivElement;
let wardrobe: Wardrobe;
let auth: Auth;
let leaveSavePage: () => void;
let serverAccount: number;
let accepted: boolean | undefined;
let serverItems: Record<number, any[]>;
let serverOutfits: Record<number, any[]>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}
const apiItem = (id: string, name = `Item ${id}`) => ({ id, name, category: 'Top', image: '',
  color: 'Blue', brand: '', cost: null, wearCount: 0, lastWorn: '2026-10-01', addedDate: '2026-10-01', postponedUntil: null });
const user = (id: number) => ({ id, email: `account${id}@example.com`, username: `Account ${id}` });

before(async () => {
  const [reactDom, authModule, wardrobeModule, authApi, itemsApi, outfitsApi, adapters, receipts] = await Promise.all([
    import('react-dom/client'), import('../../src/contexts/AuthContext'), import('../../src/contexts/WardrobeContext'),
    import('../../src/api/auth'), import('../../src/api/items'), import('../../src/api/outfits'),
    import('../../src/api/adapters'), import('../../src/state/outfitSubmission'),
  ]);
  modules = { reactDom, authModule, wardrobeModule, authApi: authApi.authApi,
    itemsApi: itemsApi.itemsApi, outfitsApi: outfitsApi.outfitsApi, adapters, receipts };
});

function SavePage() {
  const { user } = modules.authModule.useAuth();
  const { applySavedSubmission } = modules.wardrobeModule.useWardrobe();
  const start = async () => {
    const account = user.id;
    modules.receipts.saveReceipt(account, 'pending-save');
    const result = await modules.outfitsApi.submit({ submissionId: 'pending-save' });
    // Deliberately no component-local cancellation: the surviving provider must
    // enforce the boundary even when this page is already unmounted.
    accepted = applySavedSubmission(result, account);
    if (accepted) modules.receipts.clearReceipt(account, 'pending-save');
  };
  return <button onClick={() => void start()}>Start delayed save</button>;
}
function Probe() {
  wardrobe = modules.wardrobeModule.useWardrobe();
  auth = modules.authModule.useAuth();
  const [showPage, setShowPage] = useState(true);
  leaveSavePage = () => setShowPage(false);
  return <><output>{JSON.stringify({ items: wardrobe.wardrobe, outfits: wardrobe.outfits })}</output>
    {showPage && <SavePage />}</>;
}

beforeEach(async () => {
  serverAccount = 1; accepted = undefined;
  dom.window.sessionStorage.clear();
  serverItems = { 1: [apiItem('11', 'A shirt'), apiItem('12', 'A trousers')], 2: [apiItem('21', 'B shirt')] };
  serverOutfits = { 1: [], 2: [] };
  modules.authApi.me = async () => ({ user: user(serverAccount) });
  modules.authApi.login = async (email: string) => { serverAccount = email === 'b' ? 2 : 1; return { user: user(serverAccount) }; };
  modules.authApi.logout = async () => ({});
  modules.itemsApi.list = async () => structuredClone(serverItems[serverAccount]);
  modules.outfitsApi.list = async () => structuredClone(serverOutfits[serverAccount]);
  modules.itemsApi.create = async () => apiItem('13', 'Added');
  modules.itemsApi.update = async (id: string, fields: any) => ({ ...serverItems[serverAccount].find(row => row.id === id), ...fields });
  modules.itemsApi.remove = async () => ({ message: 'Removed' });
  modules.outfitsApi.submit = async () => savedResult();
  container = dom.window.document.createElement('div'); dom.window.document.body.append(container);
  root = modules.reactDom.createRoot(container);
  await act(async () => root.render(<modules.authModule.AuthProvider><modules.wardrobeModule.WardrobeProvider>
    <Probe /></modules.wardrobeModule.WardrobeProvider></modules.authModule.AuthProvider>));
  assert.equal(wardrobe.wardrobe[0].id, '11');
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

function savedResult() {
  return { submissionId: 'saved', outfit: { id: '901', date: '2026-11-02', items: ['11'], imagePath: null },
    items: [{ ...serverItems[1][0], wearCount: 1 }] };
}
async function switchToB() {
  await act(async () => { await auth.logout(); });
  await act(async () => { await auth.login('b', 'unused'); });
}

test('a save from an unmounted page cannot merge A data after signing in as B', async () => {
  const pending = deferred<any>();
  modules.outfitsApi.submit = () => pending.promise;
  await act(async () => container.querySelector('button')!.click());
  await act(async () => leaveSavePage());
  await switchToB();
  await act(async () => pending.resolve(savedResult()));
  assert.equal(accepted, false);
  assert.deepEqual(wardrobe.wardrobe.map(item => item.id), ['21']);
  assert.deepEqual(wardrobe.outfits, []);
  assert.equal(modules.receipts.readReceipt(1), 'pending-save');
});

test('the same boundary holds while B initial refresh is pending', async () => {
  const pendingSave = deferred<any>();
  const pendingB = deferred<any[]>();
  modules.outfitsApi.submit = () => pendingSave.promise;
  await act(async () => container.querySelector('button')!.click());
  await act(async () => leaveSavePage());
  const originalList = modules.itemsApi.list;
  modules.itemsApi.list = () => serverAccount === 2 ? pendingB.promise : originalList();
  await switchToB();
  assert.equal(wardrobe.loading, true);
  assert.deepEqual(wardrobe.wardrobe, []);
  await act(async () => pendingSave.resolve(savedResult()));
  assert.equal(accepted, false);
  assert.deepEqual(wardrobe.wardrobe, []);
  await act(async () => pendingB.resolve(serverItems[2]));
  assert.deepEqual(wardrobe.wardrobe.map(item => item.id), ['21']);
});

test('an explicit foreign-account submission starts no refresh and changes no state', async () => {
  await switchToB();
  let lists = 0;
  modules.itemsApi.list = async () => { lists++; return []; };
  await act(async () => { accepted = wardrobe.applySavedSubmission(savedResult(), 1); });
  assert.equal(accepted, false);
  assert.equal(lists, 0);
  assert.deepEqual(wardrobe.wardrobe.map(item => item.id), ['21']);
});

type Kind = 'edit' | 'add' | 'remove' | 'postpone';
function prepareMutation(kind: Kind) {
  const response = deferred<any>();
  if (kind === 'add') modules.itemsApi.create = () => response.promise;
  else if (kind === 'remove') modules.itemsApi.remove = () => response.promise;
  else modules.itemsApi.update = () => response.promise;
  const item = modules.adapters.apiItemToClothing(serverItems[1][0]);
  const value = kind === 'edit' ? { ...serverItems[1][0], name: 'Newer edit' }
    : kind === 'add' ? apiItem('13', 'Newer addition')
    : kind === 'postpone' ? { ...serverItems[1][0], postponedUntil: '2027-01-01' }
    : { message: 'Removed' };
  return {
    start: () => kind === 'edit' ? wardrobe.updateItem({ ...item, name: 'Newer edit' })
      : kind === 'add' ? wardrobe.addItem(modules.adapters.apiItemToClothing(value))
      : kind === 'remove' ? wardrobe.removeItem(item.id)
      : wardrobe.postponeItem(item.id, '2027-01-01'),
    finish: () => {
      serverItems[1] = kind === 'add' ? [value, ...serverItems[1]]
        : kind === 'remove' ? serverItems[1].filter(item => item.id !== '11')
        : serverItems[1].map(item => item.id === '11' ? value : item);
      response.resolve(value);
    },
    verify: () => {
      if (kind === 'edit') assert.equal(wardrobe.wardrobe.find(item => item.id === '11')?.name, 'Newer edit');
      if (kind === 'add') assert.equal(wardrobe.wardrobe.find(item => item.id === '13')?.name, 'Newer addition');
      if (kind === 'remove') assert.equal(wardrobe.wardrobe.some(item => item.id === '11'), false);
      if (kind === 'postpone') assert.equal(wardrobe.wardrobe.find(item => item.id === '11')?.postponedUntil, '2027-01-01');
    },
  };
}

for (const kind of ['edit', 'add', 'remove', 'postpone'] as Kind[]) {
  for (const order of ['refresh-first', 'write-first'] as const) {
    test(`${kind} survives a stale refresh (${order})`, async () => {
      const stale = structuredClone(serverItems[1]);
      const pendingRefresh = deferred<any[]>();
      modules.itemsApi.list = () => pendingRefresh.promise;
      const mutation = prepareMutation(kind);
      let writing: any;
      if (order === 'write-first') await act(async () => { writing = mutation.start(); });
      await act(async () => { assert.equal(wardrobe.applySavedSubmission(savedResult(), 1), true); });
      if (order === 'refresh-first') await act(async () => { writing = mutation.start(); });
      // Only the already-issued read is stale; reconciliation sees committed data.
      modules.itemsApi.list = async () => structuredClone(serverItems[serverAccount]);
      await act(async () => { mutation.finish(); await writing; });
      mutation.verify();
      await act(async () => pendingRefresh.resolve(stale));
      mutation.verify();
      assert.equal(wardrobe.loading, false);
    });
  }
  test(`${kind} response from A cannot affect B or cancel B initial load`, async () => {
    const mutation = prepareMutation(kind);
    let writing: any;
    await act(async () => { writing = mutation.start(); });
    const pendingB = deferred<any[]>();
    modules.itemsApi.list = () => pendingB.promise;
    await switchToB();
    assert.equal(wardrobe.loading, true);
    await act(async () => { mutation.finish(); await writing; });
    assert.deepEqual(wardrobe.wardrobe, []);
    assert.equal(wardrobe.loading, true);
    await act(async () => pendingB.resolve(serverItems[2]));
    assert.deepEqual(wardrobe.wardrobe.map(item => item.id), ['21']);
  });
}

test('same-account saved results still merge and refresh current statistics', async () => {
  serverItems[1][0] = { ...serverItems[1][0], wearCount: 3 };
  serverOutfits[1] = [savedResult().outfit];
  await act(async () => { assert.equal(wardrobe.applySavedSubmission(savedResult(), 1), true); });
  assert.equal(wardrobe.wardrobe.find(item => item.id === '11')?.wearCount, 3);
  assert.deepEqual(wardrobe.outfits.map(outfit => outfit.id), ['901']);
});

test('a pending edit invalidates an older refresh even when that edit fails', async () => {
  const stale = structuredClone(serverItems[1]);
  const pendingRefresh = deferred<any[]>();
  modules.itemsApi.list = () => pendingRefresh.promise;
  await act(async () => { wardrobe.applySavedSubmission(savedResult(), 1); });
  const pendingWrite = deferred<any>();
  modules.itemsApi.update = () => pendingWrite.promise;
  let writing: Promise<void>;
  const failure = new Error('write failed');
  let caught: unknown;
  await act(async () => { writing = wardrobe.updateItem(wardrobe.wardrobe[0]).catch(error => { caught = error; }); });
  await act(async () => pendingRefresh.resolve(stale));
  assert.equal(wardrobe.wardrobe.find(item => item.id === '11')?.wearCount, 1);
  modules.itemsApi.list = async () => structuredClone(serverItems[serverAccount]);
  await act(async () => { pendingWrite.reject(failure); await writing; });
  assert.equal(caught, failure);
  assert.equal(wardrobe.loading, false);
});

test('late quick-save completion remains account-scoped', async () => {
  const pending = deferred<any>();
  modules.outfitsApi.submit = () => pending.promise;
  let saving: Promise<void>;
  await act(async () => { saving = wardrobe.addOutfit([wardrobe.wardrobe[0]], '2026-11-02'); });
  await switchToB();
  await act(async () => { pending.resolve(savedResult()); await saving; });
  assert.deepEqual(wardrobe.wardrobe.map(item => item.id), ['21']);
  assert.deepEqual(wardrobe.outfits, []);
});


test('successful wardrobe saves clear their receipt and allow another wear log', async () => {
  await act(async () => { await wardrobe.addOutfit([wardrobe.wardrobe[0]], '2026-11-02'); });
  assert.equal(modules.receipts.readReceipt(1), null);
  await act(async () => { await wardrobe.addOutfit([wardrobe.wardrobe[0]], '2026-11-03'); });
  assert.equal(modules.receipts.readReceipt(1), null);
});

test('late wardrobe shortcut response preserves a newer camera receipt', async () => {
  const pending = deferred<any>();
  modules.outfitsApi.submit = () => pending.promise;
  let saving: Promise<void>;
  await act(async () => { saving = wardrobe.addOutfit([wardrobe.wardrobe[0]], '2026-11-02'); });
  const original = modules.receipts.readReceipt(1);
  assert.ok(original);
  assert.equal(modules.receipts.clearReceipt(1, original), true);
  modules.receipts.saveReceipt(1, 'newer-camera-attempt');
  await act(async () => { pending.resolve(savedResult()); await saving; });
  assert.equal(modules.receipts.readReceipt(1), 'newer-camera-attempt');
});

for (const order of ['initial-first', 'write-first'] as const) {
  test(`creation during initial loading restores existing items and history (${order})`, async () => {
    const initial = deferred<any[]>();
    const creating = deferred<any>();
    let lists = 0;
    serverOutfits[2] = [{ id: '902', date: '2026-11-01', items: ['21'] }];
    modules.itemsApi.list = () => ++lists === 1 ? initial.promise : Promise.resolve(structuredClone(serverItems[2]));
    modules.itemsApi.create = () => creating.promise;
    await switchToB();
    assert.equal(wardrobe.loading, true);
    const added = apiItem('22', 'B new shirt');
    let writing: Promise<any>;
    await act(async () => { writing = wardrobe.addItem(modules.adapters.apiItemToClothing(added)); });
    if (order === 'initial-first') await act(async () => initial.resolve([apiItem('21')]));
    await act(async () => { serverItems[2].push(added); creating.resolve(added); await writing; });
    if (order === 'write-first') await act(async () => initial.resolve([apiItem('21')]));
    assert.deepEqual(wardrobe.wardrobe.map(item => item.id).sort(), ['21', '22']);
    assert.deepEqual(wardrobe.outfits.map(outfit => outfit.id), ['902']);
    assert.equal(wardrobe.loading, false);
    assert.equal(lists, 2);
  });
}

test('a failed write during initial loading still restores the existing wardrobe', async () => {
  const initial = deferred<any[]>(); const creating = deferred<any>(); let lists = 0;
  modules.itemsApi.list = () => ++lists === 1 ? initial.promise : Promise.resolve(structuredClone(serverItems[2]));
  modules.itemsApi.create = () => creating.promise;
  await switchToB();
  let failure: unknown;
  let writing: Promise<any>;
  await act(async () => { writing = wardrobe.addItem(modules.adapters.apiItemToClothing(apiItem('22'))).catch(error => { failure = error; }); });
  await act(async () => { creating.reject(new Error('Creation failed')); await writing; });
  await act(async () => initial.resolve([]));
  assert.ok(failure instanceof Error);
  assert.deepEqual(wardrobe.wardrobe.map(item => item.id), ['21']);
  assert.equal(wardrobe.loading, false);
});

test('overlapping writes reconcile once after both writes settle', async () => {
  const adding = deferred<any>(); const editing = deferred<any>(); let lists = 0;
  modules.itemsApi.list = async () => { lists++; return structuredClone(serverItems[1]); };
  modules.itemsApi.create = () => adding.promise;
  modules.itemsApi.update = () => editing.promise;
  let add: Promise<any>; let edit: Promise<void>;
  const added = apiItem('13', 'New item');
  const edited = { ...serverItems[1][0], name: 'Edited item' };
  await act(async () => {
    add = wardrobe.addItem(modules.adapters.apiItemToClothing(added));
    edit = wardrobe.updateItem(modules.adapters.apiItemToClothing(edited));
  });
  await act(async () => { serverItems[1].push(added); adding.resolve(added); await add; });
  assert.equal(lists, 0);
  await act(async () => { serverItems[1][0] = edited; editing.resolve(edited); await edit; });
  assert.equal(lists, 1);
  assert.equal(wardrobe.wardrobe.find(item => item.id === '11')?.name, 'Edited item');
  assert.equal(wardrobe.wardrobe.find(item => item.id === '13')?.name, 'New item');
});
