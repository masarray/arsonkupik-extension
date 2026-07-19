import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const presetsModule = await import(`${pathToFileURL(path.join(root, 'src/shared/presets.js')).href}?v=${Date.now()}`);
const presets = presetsModule.FACTORY_PRESETS;
const primary = presetsModule.PRIMARY_MASTER_PRESET_IDS;
const flagship = presets.find((preset) => preset.id === 'default');
assert.equal(flagship?.name, 'Mas Ari Signature');

const expected = [
  ['dangdut-mantap', 'Dangdut Mantap'],
  ['kpop-nikmat', 'K-Pop Nikmat'],
  ['hard-rock', 'Hard Rock'],
  ['blues-asik', 'Blues Asik'],
  ['pop-indonesia', 'Pop Indonesia'],
  ['edm-santai', 'EDM Santai'],
  ['jazz-hangat', 'Jazz Hangat'],
  ['akustik-intim', 'Akustik Intim']
];
for (const [id, name] of expected) {
  const preset = presets.find((candidate) => candidate.id === id);
  assert.ok(preset, `missing ${id}`);
  assert.equal(preset.name, name);
  assert.ok(primary.includes(id), `${id} must be visible in primary preset lists`);
  assert.ok(Number(preset.output.outputGain) < Number(flagship.output.outputGain), `${name} must be quieter than flagship`);
  assert.ok(Number(preset.output.limiterDrive) < Number(flagship.output.limiterDrive), `${name} limiter drive must be calmer`);
  assert.ok(Number(preset.color.mix) < Number(flagship.color.mix), `${name} color mix must be calmer`);
}

const popupHtml = read('popup.html');
const popupJs = read('src/popup/popup.js');
assert.match(popupHtml, /supportContinueStudioButton/);
assert.match(popupHtml, /Continue to Studio/);
assert.match(popupJs, /openStudioWithSupportPrompt/);
assert.match(popupJs, /showSupportPrompt\(\{ automatic: false, studioGate: true \}\)/);
assert.match(popupJs, /if \(current\.permanentlyDismissed\) return openStudioPanel\(\)/);
assert.match(popupJs, /supportModalStudioGate/);
assert.match(popupJs, /Studio remains fully free/);
assert.doesNotMatch(popupJs, /setTimeout\([^)]*openStudio|paymentStatus|verifyPayment|fetch\s*\(/);
console.log('Signature preset and Studio support gate smoke test passed.');
