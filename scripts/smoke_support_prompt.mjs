import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const html = read('popup.html');
const js = read('src/popup/popup.js');
const css = read('src/popup/popup.css');
const svg = read('src/popup/qris-support.svg');
const privacy = read('PRIVACY.md');

for (const id of ['supportModal','supportModalCloseButton','supportLaterButton','supportConfirmedButton','supportPageButton','supportQrisImage']) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `missing popup support element ${id}`);
}
assert.match(html, /ArSonKuPik stays fully functional and free/);
assert.match(html, /Payments are not tracked by the extension/);
assert.match(js, /SUPPORT_PROMPT_DELAY_MS = 90 \* DAY_MS/);
assert.match(js, /SUPPORT_REMINDER_DELAY_MS = 30 \* DAY_MS/);
assert.match(js, /firstSuccessfulEnhanceAt/);
assert.match(js, /permanentlyDismissed/);
assert.match(js, /supporterConfirmedAt/);
assert.match(js, /chrome\.storage\.local\.get/);
assert.match(js, /chrome\.storage\.local\.set/);
assert.match(js, /supportDevelopmentButton\?\.addEventListener\('click', \(\) => showSupportPrompt/);
assert.doesNotMatch(js, /fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/);
assert.match(css, /\.support-modal-card/);
assert.match(css, /\.support-qris-frame/);
assert.match(svg, /<metadata id="qris-payload">00020101021126610014COM.GO-JEK.WWW01189360091439191940880210G9191940880303UMI51440014ID.CO.QRIS.WWW0215ID10265514017750303UMI5204899953033605802ID5925Sonkupik, Audio Developer6005BOGOR61051692362070703A016304DB67<\/metadata>/);
assert.equal(crypto.createHash('sha256').update(svg).digest('hex'), '79339bcc248eafbfe5db259779bce90f60add55bbc80ce2ee8d82d5b9665d325');
assert.match(privacy, /does not verify payments, receive transaction status, or change feature access/);
console.log('Static QRIS support prompt smoke test passed.');
