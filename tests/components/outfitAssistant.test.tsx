
import React, { act, useState } from 'react';
import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// A virtual DOM tests React behavior, not native-browser focus or visual layout.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3000/#/' });
for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document,
  navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement,
  HTMLDialogElement: dom.window.HTMLDialogElement, sessionStorage: dom.window.sessionStorage,
  IS_REACT_ACT_ENVIRONMENT: true })) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
dom.window.HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function() { this.removeAttribute('open'); };

let modules: any;
let renderRoot: any;
let container: HTMLDivElement;
let modelCalls: number;
let cityCalls: number;
let recommendationsReply: any;
let wardrobeItems: any[];
const city = { id: 123, name: 'City', country: 'Country', region: 'Region', timezone: 'UTC' };
const makeItem = (id: string, category = 'Top') => ({ id, name: `Item ${id}`, category,
  image: '', color: 'Blue', brand: '', cost: null, wearCount: 0,
  lastWorn: '2026-01-01', addedDate: '2026-01-01', postponedUntil: null });

before(async () => {
  const [reactDom, auth, wardrobe, assistant, entries, stats, authApi, itemsApi, outfitsApi, api] = await Promise.all([
    import('react-dom/client'), import('../../src/contexts/AuthContext'),
    import('../../src/contexts/WardrobeContext'), import('../../src/contexts/OutfitAssistantContext'),
    import('../../src/components/OutfitAssistantEntry'), import('../../src/components/InsightsHeroStats'),
    import('../../src/api/auth'), import('../../src/api/items'), import('../../src/api/outfits'), import('../../src/api/outfitAssistant'),
  ]);
  modules = { reactDom, auth, wardrobe, assistant, entries, stats, authApi, itemsApi, outfitsApi, api };
});

function Harness() {
  const [page, setPage] = useState('log');
  const { logout } = modules.auth.useAuth();
  const { updateItem } = modules.wardrobe.useWardrobe();
  return <>
    <button onClick={() => setPage('log')}>Show log page</button>
    <button onClick={() => setPage('insights')}>Show insights page</button>
    <button onClick={() => void logout()}>Sign out test</button>
    <button onClick={() => void updateItem({ ...makeItem('1'), name: 'Changed item', category: 'Top' })}>Change wardrobe test</button>
    {page === 'log' ? <modules.entries.OutfitAssistantEntry variant="banner" />
      : <modules.stats.InsightsHeroStats totalItems={3} newThisMonth={1} streak={2} utilization={50} />}
  </>;
}

beforeEach(async () => {
  dom.window.sessionStorage.clear();
  modelCalls = 0; cityCalls = 0;
  wardrobeItems = [makeItem('1'), makeItem('2', 'Bottom'), makeItem('3', 'Shoes')];
  recommendationsReply = { looks: [{ title: 'A test recommendation', itemIds: ['1', '2', '3'],
    items: wardrobeItems, forgottenItemIds: ['1'], weatherReason: 'Cool evening.',
    calendarReason: 'Professional plans.', forgottenReason: 'An underused shirt.' }], notes: [], weather: null };
  modules.authApi.authApi.me = async () => ({ user: { id: 1, email: 'fixture@example.com', username: 'Fixture' } });
  modules.authApi.authApi.logout = async () => ({});
  modules.itemsApi.itemsApi.list = async () => wardrobeItems;
  modules.itemsApi.itemsApi.update = async (id: string, fields: any) => {
    wardrobeItems = wardrobeItems.map(item => item.id === id ? { ...item, ...fields } : item);
    return wardrobeItems.find(item => item.id === id);
  };
  modules.outfitsApi.outfitsApi.list = async () => [];
  modules.api.outfitAssistantApi.status = async () => ({ aiReady: true, calendarReady: true, calendarConnected: true });
  modules.api.outfitAssistantApi.cities = async () => { cityCalls++; return [city]; };
  modules.api.outfitAssistantApi.events = async () => [{ id: 'event', title: 'Meeting',
    start: { dateTime: new Date().toISOString() }, end: { dateTime: new Date().toISOString() } }];
  modules.api.outfitAssistantApi.recommend = async () => { modelCalls++; return recommendationsReply; };
  container = dom.window.document.createElement('div');
  dom.window.document.body.append(container);
  renderRoot = modules.reactDom.createRoot(container);
  await act(async () => {
    renderRoot.render(<modules.auth.AuthProvider><modules.wardrobe.WardrobeProvider>
      <modules.assistant.OutfitAssistantProvider><Harness /></modules.assistant.OutfitAssistantProvider>
    </modules.wardrobe.WardrobeProvider></modules.auth.AuthProvider>);
  });
});
afterEach(async () => { await act(async () => renderRoot.unmount()); container.remove(); });

function button(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(element => element.textContent?.includes(text));
  assert.ok(found, `Missing button: ${text}`);
  return found;
}
async function click(text: string) { await act(async () => button(text).click()); }
async function open() { await click('View recommendations'); }
async function configureCity() {
  await open();
  const input = container.querySelector('input[aria-label="Recommendation city"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'City');
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await click('Find city');
  const select = container.querySelector('select[aria-label="Choose recommendation location"]') as HTMLSelectElement;
  assert.ok(select);
  await act(async () => { select.value = '123'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
}
async function consent() {
  const label = [...container.querySelectorAll('label')].find(label => label.textContent?.includes('Send wardrobe names'));
  assert.ok(label);
  await act(async () => (label.querySelector('input') as HTMLInputElement).click());
}

test('both entry points share one result without an extra generation call', async () => {
  await configureCity();
  assert.equal(modelCalls, 0);
  assert.equal(button('Recommend looks').disabled, true);
  await consent();
  await click('Recommend looks');
  assert.equal(modelCalls, 1);
  assert.match(container.textContent ?? '', /A test recommendation/);
  assert.match(container.textContent ?? '', /Forgotten piece/);
  const close = container.querySelector('button[aria-label="Close outfit recommendations"]') as HTMLButtonElement;
  await act(async () => close.click());
  assert.equal(container.querySelectorAll('dialog').length, 0);
  await click('Show insights page');
  const summary = [...container.querySelectorAll('div')].find(element => element.className.includes('lg:grid-cols-4'));
  assert.ok(summary);
  assert.equal(summary.children.length, 4);
  assert.match(summary.children[3].textContent ?? '', /AI Recommendations/);
  await open();
  assert.equal(container.querySelectorAll('dialog[open]').length, 1);
  assert.match(container.textContent ?? '', /A test recommendation/);
  assert.equal(modelCalls, 1);
});

test('selected events require a confirmed dress code before generation', async () => {
  await configureCity();
  await click('Load this day');
  const label = [...container.querySelectorAll('label')].find(label => label.textContent?.includes('Meeting'));
  assert.ok(label);
  await act(async () => (label.querySelector('input') as HTMLInputElement).click());
  await consent();
  assert.equal(button('Recommend looks').disabled, true);
  const code = container.querySelector('select[aria-label="Dress code for Meeting"]') as HTMLSelectElement;
  await act(async () => { code.value = 'professional'; code.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  assert.equal(button('Recommend looks').disabled, false);
  assert.equal(modelCalls, 0);
});

test('logout drops cached recommendations and consent', async () => {
  await configureCity(); await consent(); await click('Recommend looks');
  await click('Sign out test');
  assert.doesNotMatch(container.textContent ?? '', /A test recommendation/);
  await open();
  const label = [...container.querySelectorAll('label')].find(label => label.textContent?.includes('Send wardrobe names'));
  assert.equal((label!.querySelector('input') as HTMLInputElement).checked, false);
  assert.equal(modelCalls, 1);
});

test('relevant wardrobe changes invalidate the cached recommendation', async () => {
  await configureCity(); await consent(); await click('Recommend looks');
  await click('Change wardrobe test');
  assert.doesNotMatch(container.textContent ?? '', /A test recommendation/);
  assert.equal(modelCalls, 1);
});
