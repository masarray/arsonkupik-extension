import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Localization must never block, observe, or rewrite the high-frequency Popup/Studio runtime DOM.
const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));
const manifest = json('manifest.json');
const en = json('_locales/en/messages.json');
const id = json('_locales/id/messages.json');
const localization = read('src/shared/localization.js');
const popup = read('popup.html');
const studio = read('studio.html');
const popupBootstrap = read('src/popup/popup-bootstrap.js');
const studioBootstrap = read('src/studio/studio-bootstrap.js');
const popupEngine = read('src/popup/popup.js');
const studioEngine = read('src/studio/studio.js');

assert.equal(manifest.default_locale, 'en');
assert.match(manifest.name, /^__MSG_/);
assert.deepEqual(manifest.host_permissions || [], []);
assert.ok(!manifest.permissions.includes('geolocation'));
assert.deepEqual(Object.keys(en).sort(), Object.keys(id).sort());
assert.ok(Object.keys(en).length >= 200);
assert.match(localization, /chrome\.i18n\?\.getUILanguage/);
assert.match(localization, /arsonkupikLanguage/);
assert.match(localization, /querySelectorAll\('\[data-i18n\]'\)/);
assert.doesNotMatch(localization, /MutationObserver|characterData|translationRules|translateExistingString/);
assert.doesNotMatch(localization, /geolocation|fetch\(['"]https?:|ipify|ipinfo/i);

assert.match(popup, /id="languageSelect"/);
assert.match(studio, /id="languageSelect"/);
assert.match(popup, /popup-bootstrap\.js/);
assert.match(studio, /studio-bootstrap\.js/);

for (const bootstrap of [popupBootstrap, studioBootstrap]) {
  assert.match(bootstrap, /const localizationTask = initializeLocalization/);
  assert.doesNotMatch(bootstrap, /await initializeLocalization|installLiveLocalization/);
  assert.match(bootstrap, /dataset\.runtimeReady/);
  assert.match(bootstrap, /5500/);
  assert.match(bootstrap, /location\.reload\(\)/);
}
assert.match(popupBootstrap, /await import\('\.\/popup\.js'\)/);
assert.match(popupBootstrap, /#presetSelect option/);
assert.match(studioBootstrap, /await import\('\.\/studio\.js'\)/);
assert.match(studioBootstrap, /#compressorControls \.knob-control/);
assert.match(studioBootstrap, /#masterPresetSelect option/);
assert.match(studioBootstrap, /#svg \[data-l="grid"\]/);

assert.doesNotMatch(popupEngine, /initializeLocalization|MutationObserver/);
assert.match(studioEngine, /PERFORMANCE_MODE_LABELS/);
assert.doesNotMatch(studioEngine, /initializeLocalization|MutationObserver/);

for (const html of [popup, studio]) {
  for (const match of html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) {
    assert.ok(en[match[1]], `missing English key ${match[1]}`);
    assert.ok(id[match[1]], `missing Indonesian key ${match[1]}`);
  }
}

console.log('Non-blocking Popup/Studio English-Indonesian localization smoke test passed.');
