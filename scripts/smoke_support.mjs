import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

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
  const imagePath = path.join(root, 'docs/assets/qris-arsonkupik.svg');
  assert.ok(fs.existsSync(imagePath), 'Enabled QRIS requires the verified first-party SVG.');
  assert.equal(config.qrisImage, '../assets/qris-arsonkupik.svg');
  assert.equal(config.merchantName, 'SONKUPIK, AUDIO DEVELOPER, DIGITAL & KREATIF');
  assert.equal(config.merchantCity, 'Bogor');
  assert.match(config.lastVerified, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(supportPage, /NMID:\s*ID1026551401775/);
  assert.match(supportPage, /index,follow,max-image-preview:large/);
  assert.match(sitemap, /https:\/\/masarray\.github\.io\/arsonkupik-extension\/id\/dukung\.html/);

  const image = fs.readFileSync(imagePath);
  const svg = image.toString('utf8');
  assert.match(svg, /viewBox="0 0 61 61"/);
  assert.match(svg, /NMID ID1026551401775/);
  assert.match(svg, /SONKUPIK, AUDIO DEVELOPER, DIGITAL &amp; KREATIF/);
  assert.doesNotMatch(svg, /<script|https?:\/\//i, 'Static QRIS SVG must contain no script or remote resource.');
  const digest = crypto.createHash('sha256').update(image).digest('hex');
  assert.equal(digest, '6dd16a4ecda280b17e303c253c8619fdd43e3ca945f033f0608ec14435ff9b15', 'QRIS SVG differs from the independently verified official payload rendering.');
} else {
  assert.equal(config.merchantName, 'ArSonKuPik');
  assert.doesNotMatch(supportPage, /NMID:\s*ID1026551401775/);
  assert.match(supportPage, /noindex,follow/);
}

console.log(`Support-flow smoke test passed with QRIS ${config.qrisEnabled ? 'enabled and verified' : 'safely disabled'}.`);
