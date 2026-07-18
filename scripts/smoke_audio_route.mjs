import assert from 'node:assert/strict';

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
