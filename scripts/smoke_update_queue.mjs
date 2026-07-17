import assert from 'node:assert/strict';
import { createLatestPatchQueue, mergeLatestPatch } from '../src/shared/latest-patch-queue.js';

const merged = mergeLatestPatch(
  { eq: { gain: 1, bands: [{ id: 1 }] }, output: { gainDb: 0 } },
  { eq: { gain: 2, bands: [{ id: 2 }] }, output: { ceilingDb: -1 } }
);
assert.deepEqual(merged, {
  eq: { gain: 2, bands: [{ id: 2 }] },
  output: { gainDb: 0, ceilingDb: -1 }
});

const sends = [];
const releases = [];
let active = 0;
let maxActive = 0;
const queue = createLatestPatchQueue((patch) => new Promise((resolve) => {
  active += 1;
  maxActive = Math.max(maxActive, active);
  sends.push(structuredClone(patch));
  releases.push(() => {
    active -= 1;
    resolve({ ok: true, patch });
  });
}));

const first = queue({ eq: { gain: 1, q: 0.7 } });
await new Promise(setImmediate);
assert.equal(sends.length, 1);

const second = queue({ eq: { gain: 2 }, output: { gainDb: -1 } });
const third = queue({ eq: { gain: 3, frequency: 1000 } });
const fourth = queue({ output: { ceilingDb: -0.5 } });
assert.equal(sends.length, 1, 'only one update may be in flight');

releases.shift()();
await new Promise(setImmediate);
assert.equal(sends.length, 2, 'rapid updates should be coalesced into one follow-up send');
assert.deepEqual(sends[1], {
  eq: { gain: 3, frequency: 1000 },
  output: { gainDb: -1, ceilingDb: -0.5 }
});
assert.equal(maxActive, 1, 'engine-state writes must remain serialized');

releases.shift()();
await Promise.all([first, second, third, fourth]);
assert.equal(active, 0);
console.log('Latest-value engine update queue smoke test passed.');
