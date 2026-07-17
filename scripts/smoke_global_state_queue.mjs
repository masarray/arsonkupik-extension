import assert from 'node:assert/strict';
import { createStateCommandScheduler } from '../src/shared/state-command-scheduler.js';

const applied = [];
let active = 0;
let maxActive = 0;
const scheduler = createStateCommandScheduler(async (patch) => {
  active += 1;
  maxActive = Math.max(maxActive, active);
  await new Promise((resolve) => setTimeout(resolve, 8));
  applied.push(structuredClone(patch));
  active -= 1;
  return { ok: true };
}, { patchDebounceMs: 15 });

const popup = scheduler.enqueuePatch({ eq: { gain: 1 }, output: { gainDb: -1 } });
const studioA = scheduler.enqueuePatch({ eq: { gain: 2, frequency: 800 } });
const studioB = scheduler.enqueuePatch({ output: { ceilingDb: -0.5 } });
await Promise.all([popup, studioA, studioB]);
assert.equal(maxActive, 1, 'global scheduler must allow only one state write in flight');
assert.deepEqual(applied, [{
  eq: { gain: 2, frequency: 800 },
  output: { gainDb: -1, ceilingDb: -0.5 }
}], 'popup and Studio patches should coalesce before persistence');

const sequence = [];
const orderedScheduler = createStateCommandScheduler(async (patch) => {
  sequence.push(patch.width?.mid === 1.1 ? 'before' : 'after');
  return { ok: true };
}, { patchDebounceMs: 5 });
const before = orderedScheduler.enqueuePatch({ width: { mid: 1.1 } });
const barrier = orderedScheduler.enqueueCommand(async () => { sequence.push('preset'); return { ok: true }; });
const after = orderedScheduler.enqueuePatch({ width: { mid: 1.3 } });
await Promise.all([before, barrier, after]);
assert.deepEqual(sequence, ['before', 'preset', 'after'], 'commands must be ordered between patch groups');

await scheduler.flush();
assert.equal(active, 0);
console.log('Global popup/Studio state scheduler stress test passed.');
