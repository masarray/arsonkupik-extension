import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const popupJs = fs.readFileSync(path.join(root, 'src/popup/popup.js'), 'utf8');
const popupHtml = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

assert.match(popupJs, /supportDevelopmentButton\?\.addEventListener\('click'.*openSupportPage/s);
assert.match(popupJs, /openStudioButton\.addEventListener\('click', openStudioPanel\)/);
assert.doesNotMatch(popupJs, /SUPPORT_PROMPT_DELAY_MS|SUPPORT_REMINDER_DELAY_MS|arsonkupikSupportPrompt/);
assert.doesNotMatch(popupJs, /maybeShowSupportPrompt|openStudioWithSupportPrompt|showSupportPrompt/);
assert.doesNotMatch(popupHtml, /id="supportModal"|qris-support\.svg|Remind me in 30 days|I've supported/);
assert.match(popupHtml, /id="supportDevelopmentButton"/);
assert.deepEqual(manifest.host_permissions || [], []);
assert.ok(!manifest.permissions.includes('geolocation'));
assert.ok(!fs.existsSync(path.join(root, 'src/popup/qris-support.svg')));

console.log('Manual-only voluntary support flow smoke test passed.');
