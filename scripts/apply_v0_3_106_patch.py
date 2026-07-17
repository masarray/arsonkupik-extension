#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path.cwd()


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one occurrence, found {count}: {old[:80]!r}')
    write(path, content.replace(old, new, 1))


def replace_all(path: str, old: str, new: str) -> None:
    content = read(path)
    if old not in content:
        raise RuntimeError(f'{path}: token not found: {old!r}')
    write(path, content.replace(old, new))


scheduler = r'''import { mergeLatestPatch } from './latest-patch-queue.js';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createStateCommandScheduler(applyPatch, { patchDebounceMs = 24 } = {}) {
  if (typeof applyPatch !== 'function') throw new TypeError('applyPatch must be a function.');

  const queue = [];
  let running = false;
  let idleWaiters = [];

  function resolveIdleWaiters() {
    if (running || queue.length) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  function mergeAdjacentPatchEntries(entry) {
    while (queue[0]?.kind === 'patch') {
      const next = queue.shift();
      entry.patch = mergeLatestPatch(entry.patch, next.patch);
      entry.waiters.push(...next.waiters);
    }
  }

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        const entry = queue.shift();
        if (entry.kind === 'patch') {
          if (patchDebounceMs > 0) await delay(patchDebounceMs);
          mergeAdjacentPatchEntries(entry);
          try {
            const result = await applyPatch(entry.patch);
            for (const waiter of entry.waiters) waiter.resolve(result);
          } catch (error) {
            for (const waiter of entry.waiters) waiter.reject(error);
          }
          continue;
        }

        try {
          entry.resolve(await entry.command());
        } catch (error) {
          entry.reject(error);
        }
      }
    } finally {
      running = false;
      if (queue.length) queueMicrotask(drain);
      else resolveIdleWaiters();
    }
  }

  function enqueuePatch(patch) {
    return new Promise((resolve, reject) => {
      const tail = queue.at(-1);
      if (tail?.kind === 'patch') {
        tail.patch = mergeLatestPatch(tail.patch, patch || {});
        tail.waiters.push({ resolve, reject });
      } else {
        queue.push({
          kind: 'patch',
          patch: mergeLatestPatch({}, patch || {}),
          waiters: [{ resolve, reject }]
        });
      }
      void drain();
    });
  }

  function enqueueCommand(command) {
    if (typeof command !== 'function') throw new TypeError('command must be a function.');
    return new Promise((resolve, reject) => {
      queue.push({ kind: 'command', command, resolve, reject });
      void drain();
    });
  }

  function flush() {
    if (!running && queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => idleWaiters.push(resolve));
  }

  return Object.freeze({ enqueuePatch, enqueueCommand, flush });
}
'''
write('src/shared/state-command-scheduler.js', scheduler)

worker = read('src/background/service-worker.js')
worker = worker.replace(
    "import { DEFAULT_PERFORMANCE_MODE, STABILITY_REVISION, normalizePerformanceMode } from '../shared/audio-stability.js';\n",
    "import { DEFAULT_PERFORMANCE_MODE, STABILITY_REVISION, normalizePerformanceMode } from '../shared/audio-stability.js';\nimport { createStateCommandScheduler } from '../shared/state-command-scheduler.js';\n",
    1,
)
worker = worker.replace(
    "let openingStudioPromise = null;\n",
    "let openingStudioPromise = null;\nlet storageReadyPromise = null;\n",
    1,
)
old_listeners = r'''chrome.runtime.onInstalled.addListener(async () => {
  await ensureStorageDefaults();
  await updateActionVisual(lastState);
});

chrome.runtime.onStartup?.addListener(async () => {
  await ensureStorageDefaults();
  await updateActionVisual(lastState);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== 'background') {
    return false;
  }

  handleBackgroundMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.target === 'background-state' && message.type === 'STATE_CHANGED') {
    lastState = prepareStateForStorage({ ...lastState, ...message.state });
    chrome.storage.local.set({ [STORE_KEYS.state]: lastState });
    updateActionVisual(lastState).catch(() => {});
  }
  return false;
});

chrome.tabCapture?.onStatusChanged?.addListener((info) => {
  if (info.status === 'stopped' || info.status === 'error') {
    safeSendMessage({ target: 'offscreen', type: 'CAPTURE_STOPPED', tabId: info.tabId });
    markCaptureInactiveIfMatches(info.tabId).catch(() => {});
  }
});

chrome.tabs?.onRemoved?.addListener((tabId) => {
  if (Number(tabId) === Number(studioTabId)) {
    studioTabId = null;
    safeSendMessage({ target: 'offscreen', type: 'SET_MONITORING_ACTIVE', active: false });
    clearStoredStudioTabId().catch(() => {});
  }
  markCaptureInactiveIfMatches(tabId).catch(() => {});
});
'''
new_listeners = r'''const stateCommandScheduler = createStateCommandScheduler(
  async (patch) => {
    await ensureStorageDefaults();
    return updateStateCommand(patch);
  },
  { patchDebounceMs: 24 }
);

function dispatchBackgroundMessage(message, sender = null) {
  if (message.type === 'UPDATE_STATE') {
    return stateCommandScheduler.enqueuePatch(message.patch || {});
  }
  return stateCommandScheduler.enqueueCommand(() => handleBackgroundMessage(message, sender));
}

async function applyOffscreenStateChanged(state) {
  await ensureStorageDefaults();
  const incomingUpdatedAt = Number(state?.updatedAt || 0);
  const currentUpdatedAt = Number(lastState?.updatedAt || 0);
  if (incomingUpdatedAt && incomingUpdatedAt < currentUpdatedAt) {
    return { ok: true, ignored: true };
  }
  lastState = prepareStateForStorage({
    ...lastState,
    ...state,
    output: { ...lastState.output, ...state?.output },
    updatedAt: Math.max(Date.now(), incomingUpdatedAt, currentUpdatedAt)
  });
  await chrome.storage.local.set({ [STORE_KEYS.state]: lastState });
  await updateActionVisual(lastState);
  return { ok: true };
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureStorageDefaults();
  await updateActionVisual(lastState);
});

chrome.runtime.onStartup?.addListener(async () => {
  await ensureStorageDefaults();
  await updateActionVisual(lastState);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== 'background') {
    return false;
  }

  dispatchBackgroundMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.target === 'background-state' && message.type === 'STATE_CHANGED') {
    stateCommandScheduler.enqueueCommand(() => applyOffscreenStateChanged(message.state || {})).catch(() => {});
  }
  return false;
});

chrome.tabCapture?.onStatusChanged?.addListener((info) => {
  if (info.status === 'stopped' || info.status === 'error') {
    stateCommandScheduler.enqueueCommand(async () => {
      await ensureStorageDefaults();
      await safeSendMessage({ target: 'offscreen', type: 'CAPTURE_STOPPED', tabId: info.tabId });
      await markCaptureInactiveIfMatches(info.tabId);
    }).catch(() => {});
  }
});

chrome.tabs?.onRemoved?.addListener((tabId) => {
  stateCommandScheduler.enqueueCommand(async () => {
    await ensureStorageDefaults();
    if (Number(tabId) === Number(studioTabId)) {
      studioTabId = null;
      await safeSendMessage({ target: 'offscreen', type: 'SET_MONITORING_ACTIVE', active: false });
      await clearStoredStudioTabId();
    }
    await markCaptureInactiveIfMatches(tabId);
  }).catch(() => {});
});
'''
if old_listeners not in worker:
    raise RuntimeError('service-worker listener block changed')
worker = worker.replace(old_listeners, new_listeners, 1)
worker = worker.replace(
    'async function ensureStorageDefaults() {\n',
    "function ensureStorageDefaults() {\n  if (!storageReadyPromise) {\n    storageReadyPromise = initializeStorageDefaults().catch((error) => {\n      storageReadyPromise = null;\n      throw error;\n    });\n  }\n  return storageReadyPromise;\n}\n\nasync function initializeStorageDefaults() {\n",
    1,
)
worker = worker.replace(
    "  lastState = createDefaultState();\n  studioTabId = null;\n  await ensureStorageDefaults();\n",
    "  lastState = createDefaultState();\n  studioTabId = null;\n  storageReadyPromise = null;\n  await ensureStorageDefaults();\n",
    1,
)
old_mark = r'''async function markCaptureInactiveIfMatches(tabId) {
  const stored = await chrome.storage.local.get(STORE_KEYS.state);
  const current = prepareStateForStorage({ ...createDefaultState(), ...(stored[STORE_KEYS.state] || lastState) });
  if (!current.active || Number(current.tabId) !== Number(tabId)) return;
'''
new_mark = r'''async function markCaptureInactiveIfMatches(tabId) {
  const current = prepareStateForStorage({ ...createDefaultState(), ...lastState });
  if (!current.active || Number(current.tabId) !== Number(tabId)) return;
'''
if old_mark not in worker:
    raise RuntimeError('markCaptureInactiveIfMatches block changed')
worker = worker.replace(old_mark, new_mark, 1)
old_preset = r'''  const stored = await chrome.storage.local.get(STORE_KEYS.state);
  lastState = prepareStateForStorage(applyPresetToState({ ...createDefaultState(), ...(stored[STORE_KEYS.state] || lastState) }, preset));
'''
new_preset = r'''  lastState = prepareStateForStorage(applyPresetToState({ ...createDefaultState(), ...lastState }, preset));
'''
if old_preset not in worker:
    raise RuntimeError('applyPresetCommand source changed')
worker = worker.replace(old_preset, new_preset, 1)
old_update = r'''async function updateStateCommand(patch) {
  const normalizedPatch = normalizePerformancePatch(patch);
  const stored = await chrome.storage.local.get(STORE_KEYS.state);
  lastState = migratePerformanceForStability(prepareStateForStorage(deepMerge({ ...createDefaultState(), ...(stored[STORE_KEYS.state] || lastState) }, normalizedPatch)));
  lastState.updatedAt = Date.now();
  await chrome.storage.local.set({ [STORE_KEYS.state]: lastState });

  const offscreenResponse = await sendToOffscreenIfActive({ target: 'offscreen', type: 'UPDATE_STATE', patch: normalizedPatch }).catch(() => null);
  if (offscreenResponse?.ok && offscreenResponse.state) {
    lastState = migratePerformanceForStability(prepareStateForStorage({ ...lastState, ...offscreenResponse.state, output: { ...lastState.output, ...offscreenResponse.state.output } }));
    lastState.updatedAt = Date.now();
    await chrome.storage.local.set({ [STORE_KEYS.state]: lastState });
  }

  await updateActionVisual(lastState);
  return { ok: true, state: await getStateWithPresets() };
}
'''
new_update = r'''async function updateStateCommand(patch) {
  const normalizedPatch = normalizePerformancePatch(patch);
  lastState = migratePerformanceForStability(prepareStateForStorage(deepMerge({ ...createDefaultState(), ...lastState }, normalizedPatch)));

  const offscreenResponse = await sendToOffscreenIfActive({ target: 'offscreen', type: 'UPDATE_STATE', patch: normalizedPatch }).catch(() => null);
  if (offscreenResponse?.ok && offscreenResponse.state) {
    lastState = migratePerformanceForStability(prepareStateForStorage({
      ...lastState,
      ...offscreenResponse.state,
      output: { ...lastState.output, ...offscreenResponse.state.output }
    }));
  }

  lastState.updatedAt = Math.max(Date.now(), Number(lastState.updatedAt || 0));
  await chrome.storage.local.set({ [STORE_KEYS.state]: lastState });
  await updateActionVisual(lastState);
  return { ok: true, updatedAt: lastState.updatedAt };
}
'''
if old_update not in worker:
    raise RuntimeError('updateStateCommand source changed')
worker = worker.replace(old_update, new_update, 1)
write('src/background/service-worker.js', worker)

for path in ['manifest.json', 'package.json', '.release/release.json', 'README.md', 'docs/index.html', 'docs/id/index.html']:
    if ROOT.joinpath(path).exists():
        replace_all(path, '0.3.105', '0.3.106')

if ROOT.joinpath('package.json').exists():
    package = json.loads(read('package.json'))
    package['version'] = '0.3.106'
    package['scripts']['test:global-state-queue'] = 'node scripts/smoke_global_state_queue.mjs'
    package['scripts']['check'] += ' && node scripts/smoke_global_state_queue.mjs'
    package['scripts']['release:check'] += ' && node scripts/smoke_global_state_queue.mjs'
    write('package.json', json.dumps(package, indent=2, ensure_ascii=False) + '\n')

for path in ['scripts/smoke_stability.mjs', 'scripts/smoke_headless.mjs']:
    if ROOT.joinpath(path).exists():
        replace_all(path, '0.3.105', '0.3.106')

stress_test = r'''import assert from 'node:assert/strict';
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
'''
write('scripts/smoke_global_state_queue.mjs', stress_test)

if ROOT.joinpath('CHANGELOG.md').exists():
    changelog = read('CHANGELOG.md')
    section = '''## [0.3.106] - 2026-07-17\n\n### Added\n\n- Service-worker global state-command scheduler that serializes popup, Studio, preset, lifecycle, and offscreen state mutations.\n- Cross-context stress test covering coalescing, command barriers, and single-writer persistence.\n\n### Changed\n\n- Rapid state patches are debounced and coalesced before the service worker persists one final normalized state.\n- `UPDATE_STATE` now returns lightweight acknowledgement metadata instead of rebuilding the complete preset-bearing state response.\n- Stable GitHub release assets are immutable and cannot be overwritten with `--clobber`.\n\n### Fixed\n\n- Prevented popup and Studio contexts from writing extension state concurrently.\n- Ignored stale offscreen state notifications using monotonic update timestamps.\n- Updated Chrome Web Store listing guidance to remove obsolete output-routing and output-route storage claims.\n\n'''
    marker = '## [0.3.105] - 2026-07-17\n'
    if marker not in changelog:
        raise RuntimeError('CHANGELOG marker missing')
    changelog = changelog.replace(marker, section + marker, 1)
    changelog = changelog.replace('[Unreleased]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.105...HEAD', '[Unreleased]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.106...HEAD')
    link_marker = '[0.3.105]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.102...v0.3.105'
    changelog = changelog.replace(link_marker, '[0.3.106]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.105...v0.3.106\n' + link_marker, 1)
    write('CHANGELOG.md', changelog)

if ROOT.joinpath('ARCHITECTURE.md').exists():
    replace_once(
        'ARCHITECTURE.md',
        '- Rapid UI edits pass through a serialized latest-value queue so only one engine update is in flight and newer nested patches are coalesced.\n',
        '- Rapid UI edits first coalesce inside each page, then pass through a service-worker global command scheduler so popup, Studio, presets, lifecycle events, and offscreen notifications share one ordered state writer.\n'
    )

if ROOT.joinpath('README.md').exists():
    replace_once(
        'README.md',
        'Node-based smoke tests verify consent gating, per-site deletion, total local-data reset, audio stability, headless playback, and serialized latest-value engine updates.',
        'Node-based smoke tests verify consent gating, per-site deletion, total local-data reset, audio stability, headless playback, per-page coalescing, and global popup/Studio state serialization.'
    )

if ROOT.joinpath('CHROME_WEB_STORE_LISTING.md').exists():
    listing = read('CHROME_WEB_STORE_LISTING.md')
    listing = listing.replace('limiting, presets, and output routing.', 'limiting, presets, and system-default playback.')
    listing = listing.replace('- Output-device routing where supported by the browser and operating system\n', '- Direct playback through the browser and operating system default audio output\n')
    listing = listing.replace('consent metadata, output routes, and optional normalized per-site preferences', 'consent metadata and optional normalized per-site preferences')
    listing = listing.replace('consent metadata, output routes, and normalized per-site preferences', 'consent metadata and normalized per-site preferences')
    write('CHROME_WEB_STORE_LISTING.md', listing)

if ROOT.joinpath('CHROME_WEB_STORE_PRIVACY_DISCLOSURE.md').exists():
    disclosure = read('CHROME_WEB_STORE_PRIVACY_DISCLOSURE.md')
    disclosure = disclosure.replace('Before every Web Store upload:\n', 'Before every Web Store upload, including v0.3.106:\n')
    disclosure = disclosure.replace('6. Confirm the public privacy-policy URL is live and matches the submitted build.', '6. Confirm the public privacy-policy URL is live and matches the submitted build.\n7. Confirm the listing does not mention output-device routing or stored output routes.\n8. Confirm **Website content** is declared **No** and browsing activity is limited to the selected hostname used for optional local preferences.')
    write('CHROME_WEB_STORE_PRIVACY_DISCLOSURE.md', disclosure)

audit = '''# Release Audit 0.3.106\n\n## Scope\n\nThis release closes the cross-context state and stable-release integrity findings:\n\n- centralizes state mutations in one service-worker scheduler;\n- coalesces rapid popup and Studio patches before persistence;\n- orders presets, start/stop, reset, capture lifecycle, and offscreen notifications;\n- ignores stale offscreen notifications;\n- makes stable release assets immutable;\n- aligns Chrome Web Store listing and privacy submission guidance.\n\n## Required checks\n\n- `npm run check`\n- `npm run release:check`\n- global state scheduler stress test\n- deterministic package build\n- ZIP integrity and SHA-256 verification\n- manual Chrome popup + Studio playback endurance test\n\n## Runtime privacy\n\nPermissions remain limited to `activeTab`, `tabCapture`, `offscreen`, and `storage`. No host permissions, microphone access, telemetry, remote runtime code, output-device routing, or cloud audio path are introduced.\n'''
write('RELEASE_AUDIT_0.3.106.md', audit)

print('Applied v0.3.106 global-state and immutable-release source patch.')
