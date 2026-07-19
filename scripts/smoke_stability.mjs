import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_PERFORMANCE_MODE,
  PERFORMANCE_MODE_LABELS,
  expectedEqNodeCount,
  nextPerformanceMode,
  normalizePerformanceMode,
  requiresEqTopologyRebuild
} from '../src/shared/audio-stability.js';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

assert.equal(DEFAULT_PERFORMANCE_MODE, 'stable');
assert.equal(normalizePerformanceMode('unknown'), 'stable');
assert.equal(nextPerformanceMode('stable'), 'normal');
assert.equal(nextPerformanceMode('normal'), 'eco');
assert.equal(nextPerformanceMode('eco'), 'stable');
assert.equal(PERFORMANCE_MODE_LABELS.stable, 'STABLE');
assert.equal(expectedEqNodeCount({ type: 'bell', slope: 48 }), 1);
assert.equal(expectedEqNodeCount({ type: 'lowcut', slope: 48 }), 4);
assert.equal(requiresEqTopologyRebuild([[{}], [{}, {}]], [
  { type: 'bell', slope: 12 },
  { type: 'highcut', slope: 24 }
]), false);
assert.equal(requiresEqTopologyRebuild([[{}]], [{ type: 'highcut', slope: 24 }]), true);

const offscreen = read('src/offscreen/offscreen.js');
assert.match(offscreen, /stable:\s*\{/);
assert.match(offscreen, /label:\s*'STABLE'/);
assert.match(offscreen, /reconcileEqNodeGroups/);
assert.match(offscreen, /requiresGraphTopologyChange/);
assert.doesNotMatch(offscreen, /\|\|\s*Boolean\(patch\.eq\)/);
assert.doesNotMatch(offscreen, /if \(patch\.eq && this\.context\) this\.eqNodeGroups =/);

// P0 preset-transition regression checks: every discontinuous rack mutation is
// protected by a dry-route crossfade, adaptive steering pauses during the
// transition, and the adaptive loop never swaps WaveShaper curves live.
assert.match(offscreen, /runProtectedAudioMutation/);
assert.match(offscreen, /statePatchNeedsProtectedTransition/);
assert.match(offscreen, /this\.audioTransitionActive = true;[\s\S]*this\.stopAdaptiveAudioLoop\(\)/);
assert.match(offscreen, /applyAllParams\(\{ updateCurves: true \}\)/);
assert.match(offscreen, /if \(this\.audioTransitionActive\) return this\.state\.meters;/);
const adaptiveStart = offscreen.indexOf('  runAdaptiveAudioFrame(');
const adaptiveEnd = offscreen.indexOf('  computeMeters(', adaptiveStart);
assert.ok(adaptiveStart > 0 && adaptiveEnd > adaptiveStart, 'adaptive runtime section must be discoverable');
const adaptiveRuntime = offscreen.slice(adaptiveStart, adaptiveEnd);
assert.doesNotMatch(adaptiveRuntime, /(?:aiSilkShaper|aiEdgeShaper)\.curve\s*=/);

const worker = read('src/background/service-worker.js');
assert.match(worker, /migratePerformanceForStability/);
assert.match(worker, /STABILITY_REVISION/);
assert.match(worker, /stabilityRevision: Number\(state\.performance\?\.stabilityRevision \|\| 0\)/);
assert.match(worker, /mode:\s*eco \? 'eco' : 'stable'/);

const studio = read('src/studio/studio.js');
assert.match(studio, /nextPerformanceMode/);
assert.match(studio, /PERFORMANCE_MODE_LABELS/);
assert.match(studio, /getMeterPollMs/);
assert.match(studio, /setTimeout\(poll, getMeterPollMs\(\)\)/);

const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(read('package.json'));
assert.match(manifest.version, /^\d+\.\d+\.\d+(?:\.\d+)?$/);
assert.equal(pkg.version, manifest.version);

console.log('Audio stability smoke test passed.');
