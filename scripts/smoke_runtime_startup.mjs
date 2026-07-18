import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const offscreen = read('src/offscreen/offscreen.js');
const popupCss = read('src/popup/popup.css');

const helperIndex = offscreen.indexOf('function createSilentMeters()');
const firstUseIndex = offscreen.indexOf('createSilentMeters()');
assert.ok(helperIndex >= 0, 'Offscreen runtime must define createSilentMeters().');
assert.equal(firstUseIndex, helperIndex + 'function '.length, 'The first createSilentMeters reference must be its function declaration.');
assert.match(offscreen, /destroyMonitoringNodes\(\)[\s\S]*?this\.state\.meters\s*=\s*createSilentMeters\(\)/);
assert.match(offscreen, /getPublicState\(metersOverride\s*=\s*null\)[\s\S]*?createSilentMeters\(\)/);

assert.match(popupCss, /\.preset-select-row select\s*\{[\s\S]*?appearance:\s*none;/);
assert.match(popupCss, /\.preset-select-row select option\s*\{[\s\S]*?background:\s*#0b0f17;/);
assert.match(popupCss, /\.preset-select-row:focus-within::after/);
assert.doesNotMatch(
  popupCss,
  /\.preset-select-row select,\s*\.preset-select-row select:focus,/,
  'Preset select styling must not collapse into an empty comma-separated selector.'
);

console.log('Runtime startup helper and popup preset styling regression test passed.');
