import React, { act, StrictMode } from 'react';
import { before, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost:3000/' });
for (const [key, value] of Object.entries({ React, window: dom.window, document: dom.window.document,
  navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
dom.window.HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function() { this.removeAttribute('open'); };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const item = { id: '11', name: 'Blue shirt', category: 'Top', image: '', color: 'Blue',
  wearCount: 0, lastWorn: 'Never', addedDate: '2026-11-02' };
let modules: any;
let root: any;
let container: HTMLDivElement;
let camera: any;
before(async () => {
  const [reactDom, create, edit, hook] = await Promise.all([import('react-dom/client'),
    import('../../src/components/CreateItemModal'), import('../../src/components/ItemDetailEditModal'),
    import('../../src/hooks/useCameraCapture')]);
  modules = { reactDom, ...create, ...edit, ...hook };
});
beforeEach(() => {
  container = document.createElement('div'); document.body.append(container);
  root = modules.reactDom.createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
function button(text: string) {
  const value = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === text);
  assert.ok(value, `Missing button: ${text}`); return value;
}
function fakeStream() {
  let stops = 0;
  return { stream: { getTracks: () => [{ stop: () => { stops++; } }] }, stops: () => stops };
}
function mockCamera(getUserMedia: () => Promise<any>) {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
}
function Camera() { camera = modules.useCameraCapture(() => {}); return <video ref={camera.videoRef} />; }

test('create keeps its values after failure, prevents duplicate clicks, and supports retry', async () => {
  const first = deferred<void>(); const second = deferred<void>();
  let calls = 0; let closed = 0;
  await act(async () => root.render(<modules.CreateItemModal initialItem={item}
    onClose={() => closed++} onCreateItem={() => (++calls === 1 ? first.promise : second.promise)} />));
  await act(async () => { button('Create Piece').click(); button('Create Piece').click(); });
  assert.equal(calls, 1);
  assert.ok(button('Saving…').disabled);
  const close = container.querySelector('[aria-label="Cancel item form"]') as HTMLButtonElement;
  assert.ok(close.disabled);
  await act(async () => container.querySelector('dialog')!.dispatchEvent(new dom.window.Event('cancel', { cancelable: true })));
  assert.equal(closed, 0);
  await act(async () => first.reject(new Error('Server unavailable')));
  assert.equal(container.querySelector('[role="alert"]')?.textContent, 'Server unavailable');
  assert.equal((container.querySelector('[aria-label="Item name"]') as HTMLInputElement).value, item.name);
  await act(async () => button('Retry save').click());
  assert.equal(calls, 2);
  await act(async () => second.resolve());
  assert.equal(container.querySelector('[role="alert"]'), null);
});

test('edit remains open after failure and exits editing only after successful retry', async () => {
  const first = deferred<void>(); const second = deferred<void>(); let calls = 0;
  await act(async () => root.render(<modules.ItemDetailEditModal item={item} recommendations={[]} categories={['Top']}
    onClose={() => {}} onSelectRecommendation={() => {}} onLogWear={async () => {}}
    onSave={() => (++calls === 1 ? first.promise : second.promise)} />));
  await act(async () => button('Edit').click());
  await act(async () => button('Save').click());
  assert.ok(container.querySelector('[aria-label="Item name"]'));
  assert.ok(button('Saving…').matches(':disabled'));
  assert.ok((container.querySelector('[aria-label="Close item details"]') as HTMLButtonElement).disabled);
  await act(async () => first.reject(new Error('Edit failed')));
  assert.equal(container.querySelector('[role="alert"]')?.textContent, 'Edit failed');
  assert.equal((container.querySelector('[aria-label="Item name"]') as HTMLInputElement).value, item.name);
  await act(async () => button('Retry save').click());
  await act(async () => second.resolve());
  assert.equal(container.querySelector('[aria-label="Item name"]'), null);
  assert.ok(button('Edit'));
});

test('camera stops the current stream on retry and unmount', async () => {
  const first = fakeStream(); const second = fakeStream(); let calls = 0;
  mockCamera(async () => (++calls === 1 ? first.stream : second.stream));
  await act(async () => root.render(<Camera />));
  assert.equal(camera.videoRef.current.srcObject, first.stream);
  await act(async () => camera.startCamera());
  assert.equal(first.stops(), 1);
  assert.equal(camera.videoRef.current.srcObject, second.stream);
  await act(async () => root.render(null));
  assert.equal(second.stops(), 1);
});

test('permission resolving after unmount immediately stops its stream', async () => {
  const pending = deferred<any>(); const late = fakeStream(); mockCamera(() => pending.promise);
  await act(async () => root.render(<Camera />));
  await act(async () => root.render(null));
  await act(async () => pending.resolve(late.stream));
  assert.equal(late.stops(), 1);
});

test('out-of-order camera permission replies preserve only the newest stream', async () => {
  const first = deferred<any>(); const second = deferred<any>();
  const stale = fakeStream(); const current = fakeStream(); let calls = 0;
  mockCamera(() => (++calls === 1 ? first.promise : second.promise));
  await act(async () => root.render(<Camera />));
  let retry: Promise<void>;
  await act(async () => { retry = camera.startCamera(); });
  await act(async () => { second.resolve(current.stream); await retry; });
  await act(async () => first.resolve(stale.stream));
  assert.equal(stale.stops(), 1);
  assert.equal(current.stops(), 0);
  assert.equal(camera.videoRef.current.srcObject, current.stream);
});

test('StrictMode cleanup rejects its first pending camera request', async () => {
  const pending: ReturnType<typeof deferred<any>>[] = [];
  mockCamera(() => { const request = deferred<any>(); pending.push(request); return request.promise; });
  await act(async () => root.render(<StrictMode><Camera /></StrictMode>));
  assert.equal(pending.length, 2);
  const stale = fakeStream(); const current = fakeStream();
  await act(async () => { pending[0].resolve(stale.stream); pending[1].resolve(current.stream); });
  assert.equal(stale.stops(), 1);
  assert.equal(camera.stream, current.stream);
  await act(async () => root.render(null));
  assert.equal(current.stops(), 1);
});
