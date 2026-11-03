
import React, { act, useState } from 'react';
import { before, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3000/' });
for (const [key, value] of Object.entries({ React, window: dom.window, document: dom.window.document,
  navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement,
  HTMLDialogElement: dom.window.HTMLDialogElement, sessionStorage: dom.window.sessionStorage,
  IS_REACT_ACT_ENVIRONMENT: true })) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
// The existing project JSX setting uses React.createElement in this test loader.
// Manual wardrobe selection does not exercise image conversion or canvas rendering.
dom.window.HTMLCanvasElement.prototype.getContext = () => null;
dom.window.HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function() { this.removeAttribute('open'); };
Object.defineProperty(dom.window.navigator, 'mediaDevices', { configurable: true,
  value: { getUserMedia: async () => { throw new Error('Camera is disabled in component tests'); } } });
// HEIC is not exercised here; these prevent its import-time worker setup from
// attempting native APIs in the virtual DOM. No actual workers or camera run.
dom.window.URL.createObjectURL = () => 'blob:component-test';
dom.window.URL.revokeObjectURL = () => {};
class NoWorker { addEventListener() {} removeEventListener() {} postMessage() {} terminate() {} }
Object.defineProperty(globalThis, 'Worker', { configurable: true, value: NoWorker });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let modules: any;
let root: any;
let container: HTMLDivElement;
let navigate: (visible: boolean) => void;
let submits: any[];
let listCalls: number;
const item = { id: '11', name: 'Test shirt', category: 'Top', color: 'Blue', image: '/placeholder-garment.svg',
  brand: '', cost: null, wearCount: 0, lastWorn: '2026-10-01', addedDate: '2026-10-01' };
const result = (submissionId: string) => ({ submissionId,
  outfit: { id: '901', date: '2026-11-02', items: ['11'], imagePath: null }, items: [item] });

before(async () => {
  const [reactDom, auth, wardrobe, camera, authApi, itemsApi, outfitsApi, receipts] = await Promise.all([
    import('react-dom/client'), import('../../src/contexts/AuthContext'), import('../../src/contexts/WardrobeContext'),
    import('../../src/pages/CameraView'),
    import('../../src/api/auth'), import('../../src/api/items'), import('../../src/api/outfits'),
    import('../../src/state/outfitSubmission'),
  ]);
  modules = { reactDom, auth, wardrobe, camera, authApi: authApi.authApi,
    itemsApi: itemsApi.itemsApi, outfitsApi: outfitsApi.outfitsApi, receipts };
});
function Navigator() {
  const [visible, setVisible] = useState(true);
  navigate = setVisible;
  return visible ? <modules.camera.CameraView /> : <p>Other page</p>;
}
beforeEach(async () => {
  submits = []; listCalls = 0; dom.window.sessionStorage.clear();
  modules.authApi.me = async () => ({ user: { id: 1, email: 'camera@example.com', username: 'Camera test' } });
  modules.itemsApi.list = async () => { listCalls++; return [item]; };
  modules.outfitsApi.list = async () => [];
  modules.outfitsApi.submit = (payload: any) => {
    const pending = deferred<any>(); submits.push({ ...pending, id: payload.submissionId }); return pending.promise;
  };
  modules.outfitsApi.resolveSubmission = async (key: string) => ({ status: 'saved', result: result(key) });
  container = dom.window.document.createElement('div'); dom.window.document.body.append(container);
  root = modules.reactDom.createRoot(container);
  await act(async () => root.render(<modules.auth.AuthProvider><modules.wardrobe.WardrobeProvider>
    <Navigator />
  </modules.wardrobe.WardrobeProvider></modules.auth.AuthProvider>));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
function button(text: string): HTMLButtonElement {
  const match = [...container.querySelectorAll('button')].find(value => value.textContent?.trim() === text);
  assert.ok(match, `Missing button ${text}`); return match;
}
async function click(text: string) { await act(async () => button(text).click()); }
async function startLog() {
  await click('Browse Wardrobe');
  const select = container.querySelector('button[aria-label="Select Test shirt"]') as HTMLButtonElement;
  assert.ok(select); await act(async () => select.click());
  await click('Confirm daily log');
}
async function leaveAndReturn() {
  await act(async () => navigate(false));
  await act(async () => navigate(true));
}

test('unmounted camera save cannot apply its result or clear a newer receipt', async () => {
  await startLog();
  const original = submits[0];
  assert.equal(modules.receipts.readReceipt(1), original.id);
  await leaveAndReturn();
  assert.match(container.textContent ?? '', /Daily log saved/);
  assert.equal(modules.receipts.readReceipt(1), null);
  await click('Log another look'); await startLog();
  const newer = submits[1];
  assert.notEqual(newer.id, original.id);
  const reads = listCalls;
  await act(async () => original.resolve(result(original.id)));
  assert.equal(modules.receipts.readReceipt(1), newer.id);
  assert.equal(listCalls, reads, 'Unmounted completion must not merge or refresh shared state');
  await act(async () => newer.resolve(result(newer.id)));
  assert.equal(modules.receipts.readReceipt(1), null);
  assert.match(container.textContent ?? '', /Daily log saved/);
});

test('unmounted manual status check cannot erase a newer receipt', async () => {
  await startLog();
  await act(async () => submits[0].reject(new Error('Simulated lost response')));
  const pendingStatus = deferred<any>();
  let checks = 0;
  modules.outfitsApi.resolveSubmission = (key: string) => ++checks === 1 ? pendingStatus.promise
    : Promise.resolve({ status: 'saved', result: result(key) });
  await click('Check save status');
  await leaveAndReturn();
  await click('Log another look'); await startLog();
  const newer = submits[1];
  const reads = listCalls;
  await act(async () => pendingStatus.resolve({ status: 'saved', result: result(submits[0].id) }));
  assert.equal(modules.receipts.readReceipt(1), newer.id);
  assert.equal(listCalls, reads);
  await act(async () => newer.resolve(result(newer.id)));
});

test('late automatic recovery leaves the newly mounted camera receipt intact', async () => {
  await act(async () => navigate(false));
  modules.receipts.saveReceipt(1, 'old-recovery');
  const pendingRecovery = deferred<any>();
  let checks = 0;
  modules.outfitsApi.resolveSubmission = (key: string) => ++checks === 1 ? pendingRecovery.promise
    : Promise.resolve({ status: 'saved', result: result(key) });
  await act(async () => navigate(true));
  await leaveAndReturn();
  await click('Log another look'); await startLog();
  const newer = submits[0];
  await act(async () => pendingRecovery.resolve({ status: 'saved', result: result('old-recovery') }));
  assert.equal(modules.receipts.readReceipt(1), newer.id);
  await act(async () => newer.resolve(result(newer.id)));
});
