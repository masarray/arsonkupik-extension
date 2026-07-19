import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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


const latestSequence = [];
const latestScheduler = createStateCommandScheduler(async () => ({ ok: true }), {
  patchDebounceMs: 0,
  latestCommandDebounceMs: 18
});
const latestA = latestScheduler.enqueueLatestCommand('apply-preset', async () => {
  latestSequence.push('preset-a');
  return { ok: true, presetId: 'preset-a' };
});
const latestB = latestScheduler.enqueueLatestCommand('apply-preset', async () => {
  latestSequence.push('preset-b');
  return { ok: true, presetId: 'preset-b' };
});
const latestC = latestScheduler.enqueueLatestCommand('apply-preset', async () => {
  latestSequence.push('preset-c');
  return { ok: true, presetId: 'preset-c' };
});
const latestResults = await Promise.all([latestA, latestB, latestC]);
assert.deepEqual(latestSequence, ['preset-c'], 'rapid pending presets must execute only the newest selection');
assert.deepEqual(latestResults.map((result) => result.presetId), ['preset-c', 'preset-c', 'preset-c']);

const barrierSequence = [];
const latestBarrierScheduler = createStateCommandScheduler(async () => ({ ok: true }), {
  patchDebounceMs: 0,
  latestCommandDebounceMs: 8
});
const firstLatest = latestBarrierScheduler.enqueueLatestCommand('apply-preset', async () => {
  barrierSequence.push('first-latest');
  return { ok: true };
});
const hardBarrier = latestBarrierScheduler.enqueueCommand(async () => {
  barrierSequence.push('barrier');
  return { ok: true };
});
const secondLatest = latestBarrierScheduler.enqueueLatestCommand('apply-preset', async () => {
  barrierSequence.push('second-latest');
  return { ok: true };
});
await Promise.all([firstLatest, hardBarrier, secondLatest]);
assert.deepEqual(barrierSequence, ['first-latest', 'barrier', 'second-latest'], 'latest commands must not cross command barriers');

const failureScheduler = createStateCommandScheduler(async () => ({ ok: true }), {
  patchDebounceMs: 0,
  latestCommandDebounceMs: 8
});
const failedA = failureScheduler.enqueueLatestCommand('apply-preset', async () => ({ ok: true }));
const failedB = failureScheduler.enqueueLatestCommand('apply-preset', async () => {
  throw new Error('preset engine rejected');
});
await assert.rejects(Promise.all([failedA, failedB]), /preset engine rejected/);

const root = path.resolve(import.meta.dirname, '..');
const worker = fs.readFileSync(path.join(root, 'src/background/service-worker.js'), 'utf8');
assert.match(worker, /enqueueLatestCommand\(\s*'apply-preset'/, 'background must coalesce rapid preset requests');
const applyPresetStart = worker.indexOf('async function applyPresetCommand(');
const applyPresetEnd = worker.indexOf('\nasync function updateStateCommand(', applyPresetStart);
assert.ok(applyPresetStart > 0 && applyPresetEnd > applyPresetStart, 'preset command implementation must be discoverable');
const applyPresetBody = worker.slice(applyPresetStart, applyPresetEnd);
const engineSendAt = applyPresetBody.indexOf('await sendToOffscreenIfActive');
const storageCommitAt = applyPresetBody.indexOf('await chrome.storage.local.set');
assert.ok(engineSendAt >= 0 && storageCommitAt > engineSendAt, 'preset storage must commit only after the engine responds');
assert.match(applyPresetBody, /offscreenResponse && offscreenResponse\.ok !== true/);
assert.doesNotMatch(applyPresetBody, /sendToOffscreenIfActive[\s\S]*?\.catch\(\(\) => \{\}\)/, 'preset engine failures must not be swallowed');

await scheduler.flush();
assert.equal(active, 0);
console.log('Global popup/Studio state scheduler stress test passed.');
