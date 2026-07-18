import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const expectedImageHash = '832e363510443475bdc45062a2fd3156516957d0ac118f846c02ffe71bbbe0c6';

const worker = read('src/background/service-worker.js');
const messaging = read('src/shared/messaging.js');
const popup = read('popup.html') + read('src/popup/popup.js');
const studio = read('studio.html') + read('src/studio/studio.js');
const supportPage = read('docs/id/dukung.html');
const supportScript = read('docs/support-page.js');
const privacy = read('PRIVACY.md');
const sitemap = read('docs/sitemap.xml');

assert.match(worker, /OPEN_SUPPORT_PAGE/);
assert.match(worker, /https:\/\/masarray\.github\.io\/arsonkupik-extension\/id\/dukung\.html/);
assert.match(messaging, /export async function openSupportPage/);
assert.match(popup, /supportDevelopmentButton/);
assert.match(studio, /btnSupportDevelopment/);
assert.match(supportPage, /Dukungan sepenuhnya sukarela/);
assert.match(supportPage, /Semua fitur utama tetap tersedia/);
assert.match(privacy, /does not receive transaction status|does not determine whether a user contributes/);
assert.doesNotMatch(supportScript, /\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|sendBeacon/);

const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(read('docs/support-config.js'), context);
const config = context.globalThis.ARSONKUPIK_SUPPORT_CONFIG;
assert.ok(Array.isArray(config.suggestedAmounts));

if (config.qrisEnabled === true) {
  assert.match(config.qrisImage, /^data:image\/png;base64,/);
  assert.equal(config.qrisImageSha256, expectedImageHash);
  assert.equal(config.merchantName, 'SONKUPIK, AUDIO DEVELOPER, DIGITAL & KREATIF');
  assert.equal(config.merchantCity, 'Bogor');
  assert.equal(config.nmid, 'ID1026551401775');
  assert.match(config.qrisSource, /provider-issued QRIS image/);
  assert.match(config.lastVerified, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(supportPage, /NMID:\s*ID1026551401775/);
  assert.match(supportPage, /index,follow,max-image-preview:large/);
  assert.match(sitemap, /https:\/\/masarray\.github\.io\/arsonkupik-extension\/id\/dukung\.html/);

  const encoded = config.qrisImage.slice('data:image/png;base64,'.length);
  const imageBytes = Buffer.from(encoded, 'base64');
  const digest = crypto.createHash('sha256').update(imageBytes).digest('hex');
  assert.equal(digest, expectedImageHash, 'Embedded QRIS image bytes changed.');
  assert.equal(imageBytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Embedded QRIS image must be PNG.');
  assert.ok(imageBytes.length > 6000 && imageBytes.length < 20000, 'Embedded QRIS web image size is outside the audited range.');
  assert.doesNotMatch(config.qrisImage, /https?:\/\//i, 'QRIS image must not load from a remote origin.');
} else {
  assert.equal(config.merchantName, 'ArSonKuPik');
  assert.doesNotMatch(supportPage, /NMID:\s*ID1026551401775/);
  assert.match(supportPage, /noindex,follow/);
}

console.log(`Support-flow smoke test passed with QRIS ${config.qrisEnabled ? 'enabled and byte-verified' : 'safely disabled'}.`);
