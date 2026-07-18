import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const approvedImageHashes = new Set([
  '0095ddce62265f7a42795bb75a1077267a0873da75c84b745e23712cf53c4a11', // exact provider-issued JPEG
  '2ef5a3045a829868e0da3dce7432d7e6e4ca01224581f30769a561180d28f188', // lossless PNG conversion of the full provider sheet
  'a89088b7ebadd3feaeadaf87cf5084295ce238e135738527e7138b193b460aea'  // independently decoded web PNG
]);

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
  assert.match(config.qrisImage, /^\.\.\/assets\/qris-arsonkupik\.(?:jpg|png)$/);
  const relativeImagePath = config.qrisImage.replace(/^\.\.\//, 'docs/');
  const imagePath = path.join(root, relativeImagePath);
  assert.ok(fs.existsSync(imagePath), 'Enabled QRIS requires the approved first-party provider artwork.');
  assert.equal(config.merchantName, 'SONKUPIK, AUDIO DEVELOPER, DIGITAL & KREATIF');
  assert.equal(config.merchantCity, 'Bogor');
  assert.match(config.lastVerified, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(supportPage, /NMID:\s*ID1026551401775/);
  assert.match(supportPage, /index,follow,max-image-preview:large/);
  assert.match(sitemap, /https:\/\/masarray\.github\.io\/arsonkupik-extension\/id\/dukung\.html/);

  const imageBytes = fs.readFileSync(imagePath);
  const digest = crypto.createHash('sha256').update(imageBytes).digest('hex');
  assert.ok(approvedImageHashes.has(digest), `Unapproved QRIS artwork hash: ${digest}`);
  const signature = imageBytes.subarray(0, 8).toString('hex');
  assert.ok(signature.startsWith('ffd8ff') || signature === '89504e470d0a1a0a', 'QRIS artwork must be JPEG or PNG.');
  assert.doesNotMatch(config.qrisImage, /\.svg$/i, 'QRIS must use the original provider artwork, not a reconstructed vector QR.');
} else {
  assert.equal(config.merchantName, 'ArSonKuPik');
  assert.doesNotMatch(supportPage, /NMID:\s*ID1026551401775/);
  assert.match(supportPage, /noindex,follow/);
}

console.log(`Support-flow smoke test passed with QRIS ${config.qrisEnabled ? 'enabled and byte-verified' : 'safely disabled'}.`);
