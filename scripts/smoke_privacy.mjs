import assert from 'node:assert/strict';

const localData = {};
const sessionData = {};
const runtimeMessageListeners = [];
let tabQueryCount = 0;
const createdTabUrls = [];

// Simulate an upgrade from an earlier build that persisted an active capture.
localData.arAudioState = { active: true, tabId: 41, sourceTitle: 'Legacy active capture' };

function pick(source, keys) {
  if (keys == null) return { ...source };
  if (typeof keys === 'string') return { [keys]: source[keys] };
  if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, source[key]]));
  return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, source[key] ?? fallback]));
}

function createStorageArea(source) {
  return {
    async get(keys) { return pick(source, keys); },
    async set(values) { Object.assign(source, values); },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete source[key];
    },
    async clear() {
      for (const key of Object.keys(source)) delete source[key];
    }
  };
}

const noOpEvent = { addListener() {} };
const activeTab = { id: 41, url: 'https://www.example.com/watch?v=privacy', title: 'Privacy Test' };

globalThis.chrome = {
  runtime: {
    id: 'privacy-smoke-test',
    onInstalled: noOpEvent,
    onStartup: noOpEvent,
    onMessage: { addListener(listener) { runtimeMessageListeners.push(listener); } },
    getURL(path) { return `chrome-extension://privacy-smoke-test/${path}`; },
    async getContexts() { return []; },
    sendMessage(_message, callback) { callback?.({ ok: true }); },
    lastError: null
  },
  storage: {
    local: createStorageArea(localData),
    session: createStorageArea(sessionData)
  },
  tabs: {
    async query() { tabQueryCount += 1; return [activeTab]; },
    async get(tabId) { return { ...activeTab, id: Number(tabId) }; },
    async create({ url }) { createdTabUrls.push(url); return { id: 99, url }; },
    async update(tabId, patch) { return { ...activeTab, id: tabId, ...patch }; },
    async remove() {},
    onRemoved: noOpEvent,
    onActivated: noOpEvent,
    onUpdated: noOpEvent
  },
  windows: { async update() {}, onFocusChanged: noOpEvent },
  action: {
    async setIcon() {},
    async setTitle() {},
    async setBadgeText() {},
    async setBadgeBackgroundColor() {}
  },
  tabCapture: {
    async getMediaStreamId() { return 'mock-stream-id'; },
    onStatusChanged: noOpEvent
  },
  offscreen: { async createDocument() {} }
};

await import('../src/background/service-worker.js');

async function sendBackground(type, extra = {}) {
  const message = { target: 'background', type, ...extra };
  for (const listener of runtimeMessageListeners) {
    let resolveResponse;
    const responsePromise = new Promise((resolve) => { resolveResponse = resolve; });
    const handled = listener(message, {}, resolveResponse);
    if (handled === true) return responsePromise;
  }
  throw new Error(`No background listener handled ${type}`);
}

const initial = await sendBackground('GET_PRIVACY_STATUS');
assert.equal(initial.ok, true);
assert.equal(initial.privacy.accepted, false);
const initialState = await sendBackground('GET_STATE');
assert.equal(initialState.state.active, false);
assert.equal(initialState.state.tabId, null);
assert.equal(tabQueryCount, 0, 'Tab metadata must not be queried before privacy consent.');

const supportPage = await sendBackground('OPEN_SUPPORT_PAGE');
assert.equal(supportPage.ok, true);
assert.equal(createdTabUrls.at(-1), 'https://masarray.github.io/arsonkupik-extension/id/dukung.html');
assert.equal(tabQueryCount, 0, 'Opening the support page must not read active-tab metadata.');

const blocked = await sendBackground('START_ENHANCE');
assert.equal(blocked.ok, false);
assert.match(blocked.error, /privacy notice/i);

const accepted = await sendBackground('ACCEPT_PRIVACY_NOTICE');
assert.equal(accepted.ok, true);
assert.equal(accepted.privacy.accepted, true);
assert.ok(tabQueryCount > 0, 'Tab context may be resolved only after privacy consent.');

const started = await sendBackground('START_ENHANCE');
assert.equal(started.ok, true);
assert.deepEqual(Object.keys(localData.arAudioDomainEnhancePrefs), ['example.com']);
assert.equal('lastTitle' in localData.arAudioDomainEnhancePrefs['example.com'], false);
assert.equal('lastTabId' in localData.arAudioDomainEnhancePrefs['example.com'], false);

const cleared = await sendBackground('CLEAR_SITE_PREFERENCES');
assert.equal(cleared.ok, true);
assert.equal(cleared.privacy.sitePreferenceCount, 0);
assert.equal(cleared.privacy.accepted, true);

const reset = await sendBackground('RESET_ALL_LOCAL_DATA');
assert.equal(reset.ok, true);
assert.equal(reset.privacy.accepted, false);
assert.equal(reset.privacy.sitePreferenceCount, 0);
assert.equal(reset.privacy.customPresetCount, 0);

const blockedAgain = await sendBackground('START_ENHANCE');
assert.equal(blockedAgain.ok, false);
assert.match(blockedAgain.error, /privacy notice/i);

console.log('Privacy P0 smoke test passed.');
