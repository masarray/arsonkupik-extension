#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD = "0.3.107"
NEW = "0.3.108"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Missing patch anchor: {label}")
    return text.replace(old, new, 1)


offscreen = read("src/offscreen/offscreen.js")
offscreen = replace_once(
    offscreen,
    """  disconnectProcessingGraph() {
    try { this.source?.disconnect(this.inputGain); } catch {}
""",
    """  disconnectProcessingGraph() {
    // Chromium treats disconnect(null) as the zero-argument overload and removes
    // every outgoing connection. Never call the destination overload unless
    // both endpoints exist, otherwise tabCapture audio can be silenced entirely.
    if (this.source && this.inputGain) {
      try { this.source.disconnect(this.inputGain); } catch {}
    }
""",
    "processing graph source disconnect guard",
)
offscreen = replace_once(
    offscreen,
    """  disconnectMonitoringTaps() {
    try { this.source?.disconnect(this.inputAnalyser); } catch {}
    try { this.source?.disconnect(this.inputChannelSplitter); } catch {}
    try { this.monitoringOutputTap?.disconnect(this.outputAnalyser); } catch {}
    try { this.monitoringOutputTap?.disconnect(this.correlationSplitter); } catch {}
    for (const node of [this.inputAnalyser,this.inputChannelSplitter,this.inputLeftAnalyser,this.inputRightAnalyser,this.outputAnalyser,this.correlationSplitter,this.leftAnalyser,this.rightAnalyser,...this.getStereoBandNodes(),this.meterSink].filter(Boolean)) {
      try { node.disconnect(); } catch {}
    }
  }
""",
    """  disconnectMonitoringTaps() {
    // Do not pass null/undefined as a destination. Chromium resolves
    // disconnect(null) like disconnect(), which tears down the complete audible
    // source/output route when Studio monitoring has not been created yet.
    if (this.source && this.inputAnalyser) {
      try { this.source.disconnect(this.inputAnalyser); } catch {}
    }
    if (this.source && this.inputChannelSplitter) {
      try { this.source.disconnect(this.inputChannelSplitter); } catch {}
    }
    if (this.monitoringOutputTap && this.outputAnalyser) {
      try { this.monitoringOutputTap.disconnect(this.outputAnalyser); } catch {}
    }
    if (this.monitoringOutputTap && this.correlationSplitter) {
      try { this.monitoringOutputTap.disconnect(this.correlationSplitter); } catch {}
    }
    for (const node of [this.inputAnalyser,this.inputChannelSplitter,this.inputLeftAnalyser,this.inputRightAnalyser,this.outputAnalyser,this.correlationSplitter,this.leftAnalyser,this.rightAnalyser,...this.getStereoBandNodes(),this.meterSink].filter(Boolean)) {
      try { node.disconnect(); } catch {}
    }
  }
""",
    "monitoring destination disconnect guards",
)
write("src/offscreen/offscreen.js", offscreen)

manifest_path = ROOT / "manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
if manifest.get("version") != OLD:
    raise RuntimeError(f"Unexpected manifest version: {manifest.get('version')}")
manifest["version"] = NEW
manifest["version_name"] = NEW
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

package_path = ROOT / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
if package.get("version") != OLD:
    raise RuntimeError(f"Unexpected package version: {package.get('version')}")
package["version"] = NEW
for key in ("check", "release:check"):
    command = package["scripts"][key]
    if "smoke_audio_route.mjs" not in command:
        package["scripts"][key] = command + " && node scripts/smoke_audio_route.mjs"
package["scripts"]["test:audio-route"] = "node scripts/smoke_audio_route.mjs"
package_path.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")

release_path = ROOT / ".release/release.json"
release = json.loads(release_path.read_text(encoding="utf-8"))
release.update({
    "tag": f"v{NEW}",
    "version": NEW,
    "title": f"ArSonKuPik Extension v{NEW}",
    "prerelease": False,
})
release_path.write_text(json.dumps(release, indent=2) + "\n", encoding="utf-8")

for path in ("README.md", "docs/index.html", "docs/id/index.html"):
    text = read(path)
    if OLD not in text:
        raise RuntimeError(f"Current version missing from {path}")
    write(path, text.replace(OLD, NEW))

headless = read("scripts/smoke_headless.mjs")
headless = replace_once(
    headless,
    """assert.match(offscreen,/this\\.source\\?\\.disconnect\\(this\\.inputAnalyser\\)/);
assert.match(offscreen,/this\\.monitoringOutputTap\\?\\.disconnect\\(this\\.outputAnalyser\\)/);
""",
    """assert.match(offscreen,/if \\(this\\.source && this\\.inputAnalyser\\)/);
assert.match(offscreen,/if \\(this\\.source && this\\.inputChannelSplitter\\)/);
assert.match(offscreen,/if \\(this\\.monitoringOutputTap && this\\.outputAnalyser\\)/);
assert.match(offscreen,/if \\(this\\.monitoringOutputTap && this\\.correlationSplitter\\)/);
""",
    "headless nullable disconnect assertions",
)
write("scripts/smoke_headless.mjs", headless)

smoke = r'''import assert from 'node:assert/strict';

const edges = new Map();
const nullDestinationDisconnects = [];
let nextNodeId = 0;
let messageListener = null;
let activeContext = null;
let mediaSource = null;

class MockAudioParam {
  constructor(value = 1) { this.value = value; }
  setTargetAtTime(value) { this.value = Number(value); }
  setValueAtTime(value) { this.value = Number(value); }
  linearRampToValueAtTime(value) { this.value = Number(value); }
  cancelScheduledValues() {}
  cancelAndHoldAtTime() {}
}

class MockAudioNode {
  constructor(kind = 'node') {
    this.id = ++nextNodeId;
    this.kind = kind;
    this.gain = new MockAudioParam(1);
    this.frequency = new MockAudioParam(350);
    this.Q = new MockAudioParam(1);
    this.detune = new MockAudioParam(0);
    this.threshold = new MockAudioParam(-24);
    this.ratio = new MockAudioParam(1);
    this.knee = new MockAudioParam(0);
    this.attack = new MockAudioParam(0.003);
    this.release = new MockAudioParam(0.25);
    this.reduction = 0;
    this.fftSize = 2048;
    this.frequencyBinCount = 1024;
  }

  connect(destination) {
    if (!edges.has(this)) edges.set(this, new Set());
    edges.get(this).add(destination);
    return destination;
  }

  disconnect(...args) {
    if (args.length === 0 || args[0] == null) {
      if (args.length > 0) nullDestinationDisconnects.push({ source: this, destination: args[0] });
      edges.set(this, new Set());
      return;
    }
    edges.get(this)?.delete(args[0]);
  }

  getFloatTimeDomainData(buffer) { buffer.fill(0); }
  getFloatFrequencyData(buffer) { buffer.fill(-120); }
}

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'suspended';
    this.destination = new MockAudioNode('destination');
    activeContext = this;
  }
  createGain() { return new MockAudioNode('gain'); }
  createBiquadFilter() { return new MockAudioNode('biquad'); }
  createWaveShaper() { return new MockAudioNode('waveshaper'); }
  createDynamicsCompressor() { return new MockAudioNode('compressor'); }
  createChannelSplitter() { return new MockAudioNode('splitter'); }
  createChannelMerger() { return new MockAudioNode('merger'); }
  createAnalyser() { return new MockAudioNode('analyser'); }
  createMediaStreamSource() {
    mediaSource = new MockAudioNode('source');
    return mediaSource;
  }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
}

const stream = { getTracks: () => [{ stop() {} }] };
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    hardwareConcurrency: 8,
    deviceMemory: 8,
    mediaDevices: { getUserMedia: async () => stream }
  }
});
globalThis.AudioContext = MockAudioContext;
globalThis.chrome = {
  runtime: {
    onMessage: { addListener(listener) { messageListener = listener; } },
    sendMessage() { return Promise.resolve({ ok: true }); }
  }
};

await import(new URL(`../src/offscreen/offscreen.js?audio-route-smoke=${Date.now()}`, import.meta.url));
assert.equal(typeof messageListener, 'function', 'offscreen message listener was not registered');

function send(message) {
  return new Promise((resolve) => {
    const keepAlive = messageListener(message, {}, resolve);
    assert.equal(keepAlive, true, 'offscreen listener must keep the response channel alive');
  });
}

const startResponse = await send({
  target: 'offscreen',
  type: 'START_CAPTURE',
  streamId: 'smoke-stream',
  tabId: 1,
  sourceTitle: 'Audio route smoke test',
  initialState: null
});
assert.equal(startResponse.ok, true, startResponse.error || 'offscreen start failed');
assert.equal(activeContext?.state, 'running', 'AudioContext did not resume');
assert.equal(nullDestinationDisconnects.length, 0, 'runtime called disconnect() with a null destination');

function hasAudiblePath(source, destination) {
  const queue = [source];
  const visited = new Set([source]);
  while (queue.length) {
    const node = queue.shift();
    if (node === destination) return true;
    for (const next of edges.get(node) || []) {
      if (next.kind === 'gain' && !(Number(next.gain.value) > 1e-8)) continue;
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

assert.ok(mediaSource, 'captured media source was not created');
assert.ok(activeContext?.destination, 'system-default destination was not created');
assert.equal(
  hasAudiblePath(mediaSource, activeContext.destination),
  true,
  'captured tab audio has no non-zero route to AudioContext.destination'
);

const stopResponse = await send({ target: 'offscreen', type: 'STOP_CAPTURE' });
assert.equal(stopResponse.ok, true, stopResponse.error || 'offscreen stop failed');
console.log('Audible tab-capture route smoke test passed.');
'''
write("scripts/smoke_audio_route.mjs", smoke)

changelog = read("CHANGELOG.md")
entry = f"""## [{NEW}] - 2026-07-18

### Added

- Functional Web Audio route regression test that emulates Chromium's destructive `disconnect(null)` behavior and proves a non-zero path remains from captured tab audio to `AudioContext.destination`.

### Fixed

- Prevented inactive Studio-monitoring cleanup from calling `AudioNode.disconnect()` with null destinations, which disconnected the complete tab-capture and speaker route and caused immediate total silence after Enhance.
- Guarded processing-graph destination disconnects so future partial-startup states cannot accidentally invoke the zero-argument disconnect overload.

"""
changelog = replace_once(changelog, "## [Unreleased]\n\n", "## [Unreleased]\n\n" + entry, "changelog insertion")
write("CHANGELOG.md", changelog)

write("RELEASE_AUDIT_0.3.108.md", f"""# ArSonKuPik v{NEW} Release Audit

## Confirmed root cause

Chromium treats `AudioNode.disconnect(null)` as the zero-argument overload and removes every outgoing connection. The headless monitoring cleanup passed null analyser destinations before Studio monitoring nodes existed, disconnecting both the captured media source and the final output mixer immediately after startup.

## Permanent correction

- Destination-specific disconnects now run only when both source and destination nodes exist.
- The raw continuity route and processed route remain connected during headless playback.
- A functional graph test emulates Chromium's null-disconnect semantics and verifies a non-zero path from captured tab audio to `AudioContext.destination`.
- Version and release metadata are aligned to v{NEW}.

## Release gate

Run `npm run release:check`, build the deterministic archive, verify ZIP integrity and checksum, and test real Chrome tab capture before Web Store submission.
""")

print(f"Applied v{NEW} audible-route hotfix.")
