import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getBackgroundCommandLane } from '../src/shared/background-command-routing.js';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const serviceWorker = read('src/background/service-worker.js');
const studio = read('src/studio/studio.js');
const popup = read('src/popup/popup.js');

for (const command of ['OPEN_STUDIO', 'REGISTER_STUDIO', 'GET_STATE', 'GET_PRIVACY_STATUS', 'OPEN_PRIVACY_POLICY', 'OPEN_SUPPORT_PAGE']) {
  assert.equal(getBackgroundCommandLane(command), 'direct', `${command} must never wait behind state mutations`);
}
assert.equal(getBackgroundCommandLane('UPDATE_STATE'), 'patch');
assert.equal(getBackgroundCommandLane('APPLY_PRESET'), 'latest-command');
for (const command of ['START_ENHANCE', 'STOP_ENHANCE', 'RESET_ALL_LOCAL_DATA', 'SAVE_CUSTOM_PRESET']) {
  assert.equal(getBackgroundCommandLane(command), 'state-command');
}

assert.match(serviceWorker, /getBackgroundCommandLane/);
assert.match(serviceWorker, /Read-only and browser-UI commands must never wait behind/);
assert.match(serviceWorker, /return handleBackgroundMessage\(message, sender\);/);
assert.match(serviceWorker, /settleBrowserApi/);
assert.match(serviceWorker, /fireAndForgetBrowserApi/);
assert.doesNotMatch(serviceWorker, /await rememberStudioTabId/);
assert.doesNotMatch(serviceWorker, /await clearStoredStudioTabId/);

const studioFallback = studio.indexOf('applyFallbackState();');
const studioRefresh = studio.indexOf('await refreshState();');
assert.ok(studioFallback >= 0 && studioRefresh > studioFallback, 'Studio fallback must render before GET_STATE');
assert.match(studio, /function applyFallbackState\(\)/);
assert.match(studio, /createDefaultState\(\)/);
assert.match(studio, /layout\(\);[\s\S]*await refreshState\(\)/);

const popupFallback = popup.indexOf('applyFallbackState();');
const popupRefresh = popup.indexOf('await refreshState();');
assert.ok(popupFallback >= 0 && popupRefresh > popupFallback, 'Popup fallback must render before GET_STATE');
assert.match(popup, /function applyFallbackState\(\)/);
assert.match(popup, /createDefaultState\(\)/);

console.log('Brave Studio command routing and fail-open UI smoke test passed.');
