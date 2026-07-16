#!/usr/bin/env python3
"""Apply the ArSonKuPik v0.3.103 anti-stutter hotfix once."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, found {count}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"Expected exactly one regex match in {path}, found {count}: {pattern[:120]!r}")
    write(path, updated)


def update_json(path: str, mutator) -> None:
    data = json.loads(read(path))
    mutator(data)
    write(path, json.dumps(data, indent=2, ensure_ascii=False) + "\n")


STABILITY_MODULE = """export const DEFAULT_PERFORMANCE_MODE = 'stable';
export const STABILITY_REVISION = 1;
export const PERFORMANCE_MODE_ORDER = Object.freeze(['stable', 'normal', 'eco']);
export const PERFORMANCE_MODE_LABELS = Object.freeze({
  stable: 'STABLE',
  normal: 'TURBO',
  eco: 'ECO'
});

export function normalizePerformanceMode(mode) {
  return PERFORMANCE_MODE_ORDER.includes(mode) ? mode : DEFAULT_PERFORMANCE_MODE;
}

export function nextPerformanceMode(mode) {
  const normalized = normalizePerformanceMode(mode);
  const index = PERFORMANCE_MODE_ORDER.indexOf(normalized);
  return PERFORMANCE_MODE_ORDER[(index + 1) % PERFORMANCE_MODE_ORDER.length];
}

export function expectedEqNodeCount(band = {}) {
  const type = String(band.type || '').toLowerCase();
  const cut = type === 'lowcut' || type === 'highcut';
  if (!cut) return 1;
  return Math.max(1, Math.round(Number(band.slope || 12) / 12));
}

export function requiresEqTopologyRebuild(nodeGroups = [], bands = []) {
  if (!Array.isArray(nodeGroups) || !Array.isArray(bands)) return true;
  if (nodeGroups.length !== bands.length) return true;
  return bands.some((band, index) => (nodeGroups[index]?.length || 0) !== expectedEqNodeCount(band));
}
"""

SMOKE_TEST = """import assert from 'node:assert/strict';
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

const worker = read('src/background/service-worker.js');
assert.match(worker, /migratePerformanceForStability/);
assert.match(worker, /STABILITY_REVISION/);
assert.match(worker, /mode:\s*eco \? 'eco' : 'stable'/);

const studio = read('src/studio/studio.js');
assert.match(studio, /nextPerformanceMode/);
assert.match(studio, /PERFORMANCE_MODE_LABELS/);
assert.match(studio, /getMeterPollMs/);
assert.match(studio, /setTimeout\(poll, getMeterPollMs\(\)\)/);

const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(read('package.json'));
assert.equal(manifest.version, '0.3.103');
assert.equal(pkg.version, manifest.version);

console.log('Audio stability smoke test passed.');
"""


def patch_versions_and_tests() -> None:
    update_json('manifest.json', lambda d: d.update(version='0.3.103', version_name='0.3.103'))

    def mutate_package(data: dict) -> None:
        data['version'] = '0.3.103'
        scripts = data.setdefault('scripts', {})
        for key in ('check', 'release:check'):
            if 'smoke_stability.mjs' not in scripts[key]:
                scripts[key] += ' && node scripts/smoke_stability.mjs'
        scripts['test:stability'] = 'node scripts/smoke_stability.mjs'

    update_json('package.json', mutate_package)
    write('src/shared/audio-stability.js', STABILITY_MODULE)
    write('scripts/smoke_stability.mjs', SMOKE_TEST)
    replace_once(
        'src/shared/presets.js',
        "    performance: { mode: 'normal' },",
        "    performance: { mode: 'stable', autoSelected: true, userSelected: false, source: 'stability-default-v0.3.103', stabilityRevision: 1 },",
    )


def patch_offscreen() -> None:
    path = 'src/offscreen/offscreen.js'
    replace_once(
        path,
        "import { deviceIdToSinkId, normalizeOutputDeviceId } from '../shared/audio-devices.js';",
        "import { deviceIdToSinkId, normalizeOutputDeviceId } from '../shared/audio-devices.js';\nimport { DEFAULT_PERFORMANCE_MODE, normalizePerformanceMode, requiresEqTopologyRebuild } from '../shared/audio-stability.js';",
    )

    regex_once(
        path,
        r"const PERF_CONFIG = \{.*?\n\};\n\nfunction isLowPowerRuntime\(\)",
        """const PERF_CONFIG = {
  normal: {
    label: 'TURBO',
    rtaFftSize: 1024,
    meterFftSize: 512,
    rtaMinFrameMs: 620,
    adaptiveLoopMs: 300,
    adaptiveMinFrameMs: 130,
    shaperOversample: '2x',
    stereoBandsInAnalysis: false,
    leanAudioGraph: false,
    adaptiveLoopEnabled: true,
    basicMetersOnly: false
  },
  stable: {
    label: 'STABLE',
    // Full sonic graph with conservative analysis and no oversampling.
    rtaFftSize: 512,
    meterFftSize: 256,
    rtaMinFrameMs: 1000,
    adaptiveLoopMs: 1200,
    adaptiveMinFrameMs: 180,
    shaperOversample: 'none',
    stereoBandsInAnalysis: false,
    leanAudioGraph: false,
    adaptiveLoopEnabled: false,
    basicMetersOnly: true
  },
  eco: {
    label: 'ECO',
    rtaFftSize: 512,
    meterFftSize: 256,
    rtaMinFrameMs: 1600,
    adaptiveLoopMs: 1600,
    adaptiveMinFrameMs: 220,
    shaperOversample: 'none',
    stereoBandsInAnalysis: false,
    leanAudioGraph: true,
    adaptiveLoopEnabled: false,
    basicMetersOnly: true
  }
};

function isLowPowerRuntime()""",
        flags=re.S,
    )
    regex_once(path, r"\nfunction normalizePerformanceMode\(mode\) \{.*?\n\}\n", "\n", flags=re.S)
    text = read(path)
    text = text.replace("mode = 'normal'", "mode = DEFAULT_PERFORMANCE_MODE")
    text = text.replace("this.state.performance?.mode || 'normal'", "this.state.performance?.mode || DEFAULT_PERFORMANCE_MODE")
    text = text.replace("state.performance?.mode || 'normal'", "state.performance?.mode || DEFAULT_PERFORMANCE_MODE")
    write(path, text)

    replace_once(
        path,
        "    analyser.smoothingTimeConstant = this.performanceMode === 'eco' ? 0.24 : 0.18;",
        "    analyser.smoothingTimeConstant = this.performanceMode === 'normal' ? 0.18 : 0.24;",
    )
    replace_once(
        path,
        "    setAnalyser(this.inputAnalyser, config.rtaFftSize, this.performanceMode === 'eco' ? 0.06 : 0);\n    setAnalyser(this.outputAnalyser, config.rtaFftSize, this.performanceMode === 'eco' ? 0.06 : 0);\n    const meterSmoothing = this.performanceMode === 'eco' ? 0.24 : 0.18;",
        "    const analysisSmoothing = this.performanceMode === 'normal' ? 0 : 0.06;\n    setAnalyser(this.inputAnalyser, config.rtaFftSize, analysisSmoothing);\n    setAnalyser(this.outputAnalyser, config.rtaFftSize, analysisSmoothing);\n    const meterSmoothing = this.performanceMode === 'normal' ? 0.18 : 0.24;",
    )

    anchor = """  applyBandToNode(node, band, qOverride = null) {
    const enabled = band.enabled !== false;
    node.type = enabled ? toWebAudioType(band.type) : 'allpass';
    node.frequency.value = Number(band.frequency);
    node.gain.value = isCutType(band.type) ? 0 : Number(band.gain || 0);
    node.Q.value = qOverride ?? Number(band.q || 1);
  }

"""
    addition = anchor + """  reconcileEqNodeGroups(nextBands) {
    const normalized = normalizeEqBands(nextBands);
    if (!requiresEqTopologyRebuild(this.eqNodeGroups, normalized)) return false;
    for (const node of this.getFlatEqNodes()) {
      try { node.disconnect(); } catch {}
    }
    this.eqNodeGroups = normalized.map((band) => this.createEqNodeGroup(band));
    return true;
  }

  requiresGraphTopologyChange(previousState, nextState, eqTopologyChanged = false) {
    const previousColorActive = Boolean(previousState?.color?.enabled && Number(previousState?.color?.mix || 0) > 0);
    const nextColorActive = Boolean(nextState?.color?.enabled && Number(nextState?.color?.mix || 0) > 0);
    return Boolean(
      eqTopologyChanged
      || previousState?.eqEnabled !== nextState?.eqEnabled
      || previousState?.compressor?.enabled !== nextState?.compressor?.enabled
      || previousColorActive !== nextColorActive
      || previousState?.width?.enabled !== nextState?.width?.enabled
      || previousState?.output?.limiterEnabled !== nextState?.output?.limiterEnabled
      || isLeanAudioMode(previousState?.performance?.mode) !== isLeanAudioMode(nextState?.performance?.mode)
    );
  }

"""
    replace_once(path, anchor, addition)

    regex_once(
        path,
        r"  async applyPreset\(preset\) \{.*?\n  getAnalysisFrame\(\) \{",
        """  async applyPreset(preset) {
    if (!preset) throw new Error('Preset not found.');
    const previousState = this.state;
    this.state = this.prepareState(applyPresetToState(this.state, preset));
    if (this.context) {
      const eqTopologyChanged = this.reconcileEqNodeGroups(this.state.eq);
      this.applyAllParams();
      if (this.requiresGraphTopologyChange(previousState, this.state, eqTopologyChanged)) this.connectGraph();
      await this.applyOutputDevice();
      await this.ensureOutputPlayback();
    }
    notifyStateChanged(this.getPublicState());
  }

  async updateState(patch) {
    const previousState = this.state;
    this.state = this.prepareState(deepMerge(this.state, patch));
    if (patch.performance && this.context) this.applyPerformanceSettings({ resetBuffers: true });
    const eqTopologyChanged = Boolean(patch.eq && this.context && this.reconcileEqNodeGroups(this.state.eq));
    this.applyAllParams();
    const bypassPatch = patch.output?.bypass !== undefined;
    const graphTopologyChanged = this.context
      ? this.requiresGraphTopologyChange(previousState, this.state, eqTopologyChanged)
      : false;
    if (graphTopologyChanged) this.connectGraph();
    if (bypassPatch) this.crossfadeEnhancePower(Boolean(this.state.output.bypass));
    if (patch.output?.outputDeviceId !== undefined || patch.output?.outputDeviceLabel !== undefined) {
      await this.applyOutputDevice();
      await this.ensureOutputPlayback();
    }
    if (patch.performance && this.context) {
      this.runAdaptiveAudioFrame({ force: true, includeStereoBands: false });
      this.startAdaptiveAudioLoop();
    }
    this.state.updatedAt = Date.now();
    notifyStateChanged(this.getPublicState());
  }

  getAnalysisFrame() {""",
        flags=re.S,
    )


def patch_background() -> None:
    path = 'src/background/service-worker.js'
    replace_once(
        path,
        "import { createDefaultState, FACTORY_PRESETS, DEFAULT_MASTER_REVISION, applyPresetToState, normalizeEqBands, normalizeCompressor, normalizeColor, normalizeWidth, normalizeOutput } from '../shared/presets.js';",
        "import { createDefaultState, FACTORY_PRESETS, DEFAULT_MASTER_REVISION, applyPresetToState, normalizeEqBands, normalizeCompressor, normalizeColor, normalizeWidth, normalizeOutput } from '../shared/presets.js';\nimport { DEFAULT_PERFORMANCE_MODE, STABILITY_REVISION, normalizePerformanceMode } from '../shared/audio-stability.js';",
    )

    regex_once(
        path,
        r"function detectInitialPerformanceMode\(\) \{.*?\n\}\n\nfunction applyInitialPerformanceMode",
        """function detectInitialPerformanceMode() {
  const nav = globalThis.navigator || {};
  const cores = Number(nav.hardwareConcurrency || 0);
  const memory = Number(nav.deviceMemory || 0);
  const hasCoreHint = Number.isFinite(cores) && cores > 0;
  const hasMemoryHint = Number.isFinite(memory) && memory > 0;
  const veryLowCore = hasCoreHint && cores <= 2;
  const lowCore = hasCoreHint && cores <= 4;
  const lowMemory = hasMemoryHint && memory <= 4;
  const tinyMemory = hasMemoryHint && memory <= 2;
  const eco = Boolean(veryLowCore || tinyMemory || (lowCore && lowMemory));
  return {
    mode: eco ? 'eco' : 'stable',
    autoSelected: true,
    userSelected: false,
    source: 'initial-stability-hint',
    stabilityRevision: STABILITY_REVISION,
    hardwareConcurrency: hasCoreHint ? cores : null,
    deviceMemory: hasMemoryHint ? memory : null,
    reason: eco ? 'low-power hardware hint' : 'stable playback default',
    selectedAt: Date.now()
  };
}

function applyInitialPerformanceMode""",
        flags=re.S,
    )

    anchor = """function applyInitialPerformanceMode(state) {
  const hint = detectInitialPerformanceMode();
  return {
    ...state,
    performance: hint
  };
}

"""
    addition = anchor + """function migratePerformanceForStability(state) {
  const performance = { ...(state.performance || {}) };
  const mode = normalizePerformanceMode(performance.mode || DEFAULT_PERFORMANCE_MODE);
  const revision = Number(performance.stabilityRevision || 0);
  const migrateAutoTurbo = revision < STABILITY_REVISION && mode === 'normal' && performance.userSelected !== true;
  return {
    ...state,
    performance: {
      ...performance,
      mode: migrateAutoTurbo ? 'stable' : mode,
      autoSelected: migrateAutoTurbo ? true : Boolean(performance.autoSelected),
      userSelected: performance.userSelected === true,
      source: migrateAutoTurbo ? 'v0.3.103-stability-migration' : (performance.source || 'normalized'),
      stabilityRevision: STABILITY_REVISION,
      migratedAt: migrateAutoTurbo ? Date.now() : Number(performance.migratedAt || 0)
    }
  };
}

function normalizePerformancePatch(patch) {
  if (!patch?.performance || patch.performance.mode === undefined) return patch;
  return {
    ...patch,
    performance: {
      ...patch.performance,
      mode: normalizePerformanceMode(patch.performance.mode),
      userSelected: patch.performance.userSelected ?? true,
      autoSelected: patch.performance.autoSelected ?? false,
      source: patch.performance.source || 'user-control',
      stabilityRevision: STABILITY_REVISION,
      selectedAt: Number(patch.performance.selectedAt || Date.now())
    }
  };
}

"""
    replace_once(path, anchor, addition)

    regex_once(
        path,
        r"  if \(!current\[STORE_KEYS\.state\]\) \{.*?\n  \}\n  if \(!current\[STORE_KEYS\.customPresets\]\)",
        """  if (!current[STORE_KEYS.state]) {
    lastState = migratePerformanceForStability(prepareStateForStorage(applyInitialPerformanceMode(createDefaultState())));
    await chrome.storage.local.set({ [STORE_KEYS.state]: lastState });
  } else {
    const storedState = current[STORE_KEYS.state];
    lastState = migratePerformanceForStability(prepareStateForStorage({ ...createDefaultState(), ...storedState }));
    if (shouldRefreshFactoryDefaultMaster(storedState)) {
      const defaultPreset = FACTORY_PRESETS.find((preset) => preset.id === 'default') || FACTORY_PRESETS[0];
      const preservedPerformance = lastState.performance;
      lastState = prepareStateForStorage(applyPresetToState(lastState, defaultPreset));
      lastState.performance = preservedPerformance;
    }
    lastState = migratePerformanceForStability(lastState);
    await chrome.storage.local.set({ [STORE_KEYS.state]: lastState });
  }
  if (!current[STORE_KEYS.customPresets])""",
        flags=re.S,
    )

    regex_once(
        path,
        r"async function updateStateCommand\(patch\) \{.*?\n\}\n\n\nasync function saveDomainEnhancePreference",
        """async function updateStateCommand(patch) {
  const normalizedPatch = normalizePerformancePatch(patch);
  const stored = await chrome.storage.local.get(STORE_KEYS.state);
  lastState = migratePerformanceForStability(prepareStateForStorage(deepMerge({ ...createDefaultState(), ...(stored[STORE_KEYS.state] || lastState) }, normalizedPatch)));
  lastState.updatedAt = Date.now();
  await chrome.storage.local.set({ [STORE_KEYS.state]: lastState });
  await saveDomainOutputRouteIfNeeded(normalizedPatch, lastState);

  const offscreenResponse = await sendToOffscreenIfActive({ target: 'offscreen', type: 'UPDATE_STATE', patch: normalizedPatch }).catch(() => null);
  if (offscreenResponse?.ok && offscreenResponse.state) {
    lastState = migratePerformanceForStability(prepareStateForStorage({ ...lastState, ...offscreenResponse.state, output: { ...lastState.output, ...offscreenResponse.state.output } }));
    lastState.updatedAt = Date.now();
    await chrome.storage.local.set({ [STORE_KEYS.state]: lastState });
  }

  await updateActionVisual(lastState);
  return { ok: true, state: await getStateWithPresets() };
}


async function saveDomainEnhancePreference""",
        flags=re.S,
    )

    replace_once(
        path,
        "      mode: state.performance?.mode === 'eco' ? 'eco' : 'normal'",
        "      mode: normalizePerformanceMode(state.performance?.mode || DEFAULT_PERFORMANCE_MODE),\n      stabilityRevision: Number(state.performance?.stabilityRevision || STABILITY_REVISION)",
    )


def patch_studio() -> None:
    path = 'src/studio/studio.js'
    replace_once(
        path,
        "} from '../shared/presets.js';\nimport { detectAudioOutputDevices, normalizeOutputDeviceId, openBrowserAudioOutputChooser, watchAudioOutputDeviceChanges } from '../shared/audio-devices.js';",
        "} from '../shared/presets.js';\nimport { DEFAULT_PERFORMANCE_MODE, PERFORMANCE_MODE_LABELS, STABILITY_REVISION, nextPerformanceMode, normalizePerformanceMode } from '../shared/audio-stability.js';\nimport { detectAudioOutputDevices, normalizeOutputDeviceId, openBrowserAudioOutputChooser, watchAudioOutputDeviceChanges } from '../shared/audio-devices.js';",
    )
    replace_once(path, "const PERFORMANCE_MODES = { normal: 'TURBO', eco: 'ECO' };\n", "")
    replace_once(path, "const METER_POLL_MS = 170;", "const METER_POLL_INTERVALS = Object.freeze({ normal: 170, stable: 320, eco: 620 });")

    regex_once(
        path,
        r"function getPerformanceMode\(\) \{.*?\n\}\n\nfunction syncMasterBypassButton",
        """function getPerformanceMode() {
  return normalizePerformanceMode(state?.performance?.mode || DEFAULT_PERFORMANCE_MODE);
}

function getMeterPollMs() {
  return METER_POLL_INTERVALS[getPerformanceMode()] || METER_POLL_INTERVALS.stable;
}

function renderPerformanceToggle() {
  const button = ui.btnPerformanceMode;
  if (!button) return;
  const mode = getPerformanceMode();
  button.dataset.mode = mode;
  button.setAttribute('aria-pressed', mode === 'normal' ? 'true' : 'false');
  const descriptions = {
    stable: 'Engine quality: STABLE — full sound with lighter analysis for reliable playback',
    normal: 'Engine quality: TURBO — oversampled adaptive processing for powerful computers',
    eco: 'Engine quality: ECO — simplified processing for low-spec computers'
  };
  const label = PERFORMANCE_MODE_LABELS[mode] || PERFORMANCE_MODE_LABELS.stable;
  button.title = descriptions[mode];
  button.setAttribute('aria-label', `${descriptions[mode]}. Click to cycle mode.`);
  const labelEl = button.querySelector('.perf-label');
  if (labelEl) labelEl.textContent = label;
}

async function togglePerformanceMode() {
  if (!state || busy) return;
  const previousMode = getPerformanceMode();
  const nextMode = nextPerformanceMode(previousMode);
  const nextPerformance = {
    ...(state.performance || {}),
    mode: nextMode,
    userSelected: true,
    autoSelected: false,
    source: 'studio-toggle',
    stabilityRevision: STABILITY_REVISION,
    selectedAt: Date.now()
  };
  state.performance = nextPerformance;
  renderPerformanceToggle();
  startMeterPolling();
  try {
    await updateEngineState({ performance: nextPerformance });
    await refreshState(false);
  } catch (error) {
    console.error(error);
    state.performance = { ...(state.performance || {}), mode: previousMode };
    renderPerformanceToggle();
    startMeterPolling();
  }
}

function syncMasterBypassButton""",
        flags=re.S,
    )

    regex_once(
        path,
        r"function startMeterPolling\(\) \{.*?\n\}\n\nfunction updateMeters",
        """function startMeterPolling() {
  clearTimeout(pollingTimer);
  const poll = async () => {
    pollingTimer = null;
    if (!document.hidden) {
      const response = await sendMessage({ target: 'offscreen', type: 'GET_ANALYSIS_FRAME' }).catch(() => null);
      if (response?.ok) {
        lastMeterPayload = response.frame || null;
        rtaFrame = normalizeRtaFrame(response.frame?.spectrum);
        if (response.frame?.state) {
          state = { ...state, ...response.frame.state, eqEnabled: response.frame.state.eqEnabled !== false };
          bypassAll = Boolean(state.output?.bypass);
          renderChromeState();
        }
        updateMeters(response.frame?.meters || {});
      }
    }
    pollingTimer = setTimeout(poll, getMeterPollMs());
  };
  pollingTimer = setTimeout(poll, 0);
}

function updateMeters""",
        flags=re.S,
    )

    replace_once(
        'studio.html',
        '<button class="btn perf-toggle" id="btnPerformanceMode" type="button" title="Engine quality: TURBO" aria-label="Engine quality: TURBO" aria-pressed="false" data-mode="normal">',
        '<button class="btn perf-toggle" id="btnPerformanceMode" type="button" title="Engine quality: STABLE" aria-label="Engine quality: STABLE" aria-pressed="false" data-mode="stable">',
    )
    replace_once('studio.html', '<span class="perf-label">TURBO</span>', '<span class="perf-label">STABLE</span>')

    regex_once(
        'src/studio/studio.shell.css',
        r"/\* v0\.3\.82 Engine performance guard.*?\.perf-toggle:hover\{transform:translateY\(-1px\);filter:brightness\(1\.08\)\}\n",
        """/* v0.3.103 three-stage performance guard: ECO · STABLE · TURBO. */
.perf-toggle{height:32px;min-width:128px;padding:0 8px;border-radius:999px;gap:6px;background:linear-gradient(180deg,#081923,#070A11);border-color:rgba(95,227,214,.36);box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 8px 22px -16px #000,0 0 18px -14px rgba(95,227,214,.72)}
.perf-toggle .perf-icon{width:18px;height:18px;border-radius:999px;display:grid;place-items:center;color:rgba(255,255,255,.38);transition:color .18s var(--ease),filter .18s var(--ease),transform .18s var(--ease)}
.perf-toggle .perf-icon svg{width:14px;height:14px}.perf-icon-eco{color:rgba(34,197,94,.55)}.perf-icon-turbo{color:rgba(249,115,22,.55)}
.perf-track{position:relative;width:36px;height:16px;border-radius:999px;background:linear-gradient(90deg,rgba(34,197,94,.26),rgba(95,227,214,.32),rgba(249,115,22,.30));border:1px solid rgba(255,255,255,.10);box-shadow:inset 0 1px 4px rgba(0,0,0,.44)}
.perf-track i{position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:999px;transform:translateX(10px);background:linear-gradient(135deg,#5FE3D6,#6EA8FF);box-shadow:0 0 12px -2px rgba(95,227,214,.9);transition:transform .18s var(--ease),background .18s var(--ease),box-shadow .18s var(--ease)}
.perf-label{font-family:var(--mono);font-size:8px;letter-spacing:.12em;font-weight:900;color:#9FF7EF;min-width:40px;text-align:left;text-shadow:0 0 10px rgba(95,227,214,.28)}
.perf-toggle[data-mode="normal"]{border-color:rgba(249,115,22,.34);background:linear-gradient(180deg,#1B1209,#080A0F);box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 8px 22px -16px #000,0 0 18px -14px rgba(249,115,22,.82)}
.perf-toggle[data-mode="normal"] .perf-icon-turbo{color:#f97316;filter:drop-shadow(0 0 8px rgba(249,115,22,.58));transform:scale(1.04)}
.perf-toggle[data-mode="normal"] .perf-track i{transform:translateX(20px);background:linear-gradient(135deg,#f59e0b,#f97316);box-shadow:0 0 12px -2px rgba(249,115,22,.9)}
.perf-toggle[data-mode="normal"] .perf-label{color:#fbbf24;text-shadow:0 0 10px rgba(249,115,22,.28)}
.perf-toggle[data-mode="eco"]{border-color:rgba(34,197,94,.34);background:linear-gradient(180deg,#07180F,#070A11);box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 8px 22px -16px #000,0 0 18px -14px rgba(34,197,94,.82)}
.perf-toggle[data-mode="eco"] .perf-icon-eco{color:#22c55e;filter:drop-shadow(0 0 8px rgba(34,197,94,.58));transform:scale(1.04)}
.perf-toggle[data-mode="eco"] .perf-track i{transform:translateX(0);background:linear-gradient(135deg,#22c55e,#16a34a);box-shadow:0 0 12px -2px rgba(34,197,94,.9)}
.perf-toggle[data-mode="eco"] .perf-label{color:#86efac;text-shadow:0 0 10px rgba(34,197,94,.28)}
.perf-toggle:hover{transform:translateY(-1px);filter:brightness(1.08)}
""",
        flags=re.S,
    )


def patch_validation_and_docs() -> None:
    replace_once(
        'scripts/validate.py',
        '    ROOT / "src/shared/presets.js",',
        '    ROOT / "src/shared/presets.js",\n    ROOT / "src/shared/audio-stability.js",\n    ROOT / "scripts/smoke_stability.mjs",',
    )

    changelog = read('CHANGELOG.md')
    marker = '## [Unreleased]\n'
    if marker not in changelog:
        raise RuntimeError('CHANGELOG.md Unreleased marker not found')
    entry = """## [Unreleased]

## [0.3.103] - 2026-07-16

### Added

- STABLE mode as the full-sound default between ECO and TURBO.
- Regression smoke test for performance migration and EQ topology stability.

### Changed

- Parameter-only EQ edits now update existing AudioParams without disconnecting the live audio graph.
- Studio meter polling adapts to performance mode and avoids overlapping asynchronous requests.
- Automatically selected legacy TURBO states migrate once to STABLE; explicit user choices are preserved.

### Fixed

- Reduced audio gaps and crackle while dragging ordinary EQ frequency, gain, and Q controls.
- Reduced background analysis pressure while preserving the complete DSP chain in STABLE mode.
"""
    write('CHANGELOG.md', changelog.replace(marker, entry, 1))

    for page in ('docs/index.html', 'docs/id/index.html'):
        write(page, read(page).replace('0.3.102', '0.3.103'))
    write('README.md', read('README.md').replace('`0.3.102` privacy-hardened engine', '`0.3.103` stability-hardened engine'))


def main() -> None:
    patch_versions_and_tests()
    patch_offscreen()
    patch_background()
    patch_studio()
    patch_validation_and_docs()
    print('Applied ArSonKuPik v0.3.103 audio stability hotfix.')


if __name__ == '__main__':
    main()
