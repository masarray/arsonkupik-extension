import {
  FACTORY_PRESETS,
  createDefaultState,
  applyPresetToState,
  dbToGain,
  normalizeEqBands,
  normalizeCompressor,
  normalizeColor,
  normalizeWidth,
  normalizeOutput,
  toWebAudioType,
  isCutType
} from '../shared/presets.js';
import { buildSfeqRtaSpectrumFromFft } from '../shared/sfeq-rta.js';
import { DEFAULT_PERFORMANCE_MODE, normalizePerformanceMode, requiresEqTopologyRebuild } from '../shared/audio-stability.js';

const AUDIO_CONSTRAINTS = (streamId) => ({
  audio: {
    mandatory: {
      chromeMediaSource: 'tab',
      chromeMediaSourceId: streamId
    }
  },
  video: false
});

const BUTTERWORTH_Q = {
  12: [0.70710678],
  24: [0.5411961, 1.30656296],
  36: [0.51763809, 0.70710678, 1.93185165],
  48: [0.50979558, 0.60134489, 0.89997622, 2.56291545]
};

const RTA_POINT_COUNT = 80;
const RTA_OCTAVE_WIDTH = 1 / 7;
const PERF_CONFIG = {
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

function isLowPowerRuntime() {
  const nav = navigator || {};
  const lowMemoryDevice = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4;
  const lowCoreDevice = typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4;
  return lowMemoryDevice || lowCoreDevice;
}


function getPerfConfig(mode) {
  return PERF_CONFIG[normalizePerformanceMode(mode)] || PERF_CONFIG.normal;
}

function isLeanAudioMode(mode) {
  return Boolean(getPerfConfig(mode).leanAudioGraph);
}

function chooseRtaFftSize(mode = DEFAULT_PERFORMANCE_MODE) {
  return getPerfConfig(mode).rtaFftSize;
}

function chooseMeterFftSize(mode = DEFAULT_PERFORMANCE_MODE) {
  return getPerfConfig(mode).meterFftSize;
}

function createSilentMeters() {
  return {
    inputPeak: 0,
    outputPeak: 0,
    gainReduction: 0,
    compressorGainReduction: 0,
    compressorGainReductionLeft: 0,
    compressorGainReductionRight: 0,
    limiterGainReduction: 0,
    inputPeakLeft: 0,
    inputPeakRight: 0,
    outputPeakLeft: 0,
    outputPeakRight: 0,
    correlation: 1,
    inputCorrelation: 1,
    inputStereoWidth: 0,
    widthAdaptiveFactor: 0.35,
    stereoBands: {
      low: { width: 0, correlation: 1 },
      mid: { width: 0, correlation: 1 },
      high: { width: 0, correlation: 1 }
    },
    clipping: false,
    smartHeadroomDb: 0,
    smartMakeupDb: 0,
    dopamineToneMap: null,
    adaptiveRuntime: 'idle',
    performanceMode: DEFAULT_PERFORMANCE_MODE,
    adaptiveUpdatedAt: 0
  };
}

let engine = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== 'offscreen') return false;
  handleOffscreenMessage(message)
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

async function handleOffscreenMessage(message) {
  const host = getEngine();
  switch (message.type) {
    case 'START_CAPTURE':
      await host.start(message.streamId, message.tabId, message.sourceTitle, message.initialState);
      return { ok: true, state: host.getPublicState() };
    case 'STOP_CAPTURE':
    case 'CAPTURE_STOPPED':
      await host.stop();
      return { ok: true, state: host.getPublicState() };
    case 'GET_STATE':
      return { ok: true, state: host.getPublicState() };
    case 'GET_ANALYSIS_FRAME':
      return { ok: true, frame: host.getAnalysisFrame() };
    case 'SET_MONITORING_ACTIVE':
      host.setMonitoringActive(Boolean(message.active));
      return { ok: true, state: host.getPublicState() };
    case 'APPLY_PRESET':
      await host.applyPreset(message.preset || FACTORY_PRESETS.find((p) => p.id === message.presetId));
      return { ok: true, state: host.getPublicState() };
    case 'UPDATE_STATE':
      await host.updateState(message.patch || {});
      return { ok: true, state: host.getPublicState() };
    default:
      throw new Error(`Unknown offscreen message: ${message.type}`);
  }
}

function getEngine() {
  if (!engine) engine = new AudioEnhancerEngine();
  return engine;
}

function notifyStateChanged(state) {
  safeSendMessage({ target: 'background-state', type: 'STATE_CHANGED', state });
}

function safeSendMessage(message) {
  try {
    const result = chrome.runtime.sendMessage(message);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {}
}

class AudioEnhancerEngine {
  constructor() {
    this.state = createDefaultState();
    this.context = null;
    this.stream = null;
    this.source = null;
    this.inputGain = null;
    this.smartHeadroomGain = null;
    this.smartMakeupGain = null;
    this.smartHeadroomDb = 0;
    this.smartMakeupDb = 0;
    this.inputChannelSplitter = null;
    this.inputLeftAnalyser = null;
    this.inputRightAnalyser = null;
    this.safetyHighPass = null;
    this.eqNodeGroups = [];
    this.compNodes = {};
    this.colorNodes = {};
    this.widthNodes = {};
    this.compressor = null;
    this.makeupGain = null;
    this.limiter = null;
    this.limiterDrive = null;
    this.softClipper = null;
    this.outputGain = null;
    this.bypassGain = null;
    this.processedGain = null;
    this.outputMixGain = null;
    this.inputAnalyser = null;
    this.outputAnalyser = null;
    this.correlationSplitter = null;
    this.leftAnalyser = null;
    this.rightAnalyser = null;
    this.meterSink = null;
    this.stereoBands = [];
    this.widthAdaptiveFactor = 0.35;
    this.colorStereoAdaptive = 0.85;
    this.sideMidBase = { presence: 0, tone: 0, driveDb: 0, wet: 0 };
    this.vocalTickleBase = { focus: 0, guardTrim: 0, driveDb: 0, wet: 0 };
    this.godParticleBase = { sideWet: 0, midWet: 0, driveDb: 0, shimmer: 0, guard: 0, midSparkle: 0, bassPower: 0 };
    this.trebleSkinBase = { focus: 0, tone: 0, driveDb: 0, wet: 0 };
    this.midAnchorBase = { peak: 0, tone: 0, driveDb: 0, wet: 0 };
    this.midProjectionBase = { body: 0, focus: 0, nasalTrim: 0, shoutTrim: 0, driveDb: 0, wet: 0, sideTuck: 0 };
    this.lowMidBodyBase = { focus: 0, mudTrim: 0, driveDb: 0, wet: 0 };
    this.upperMidBodyBase = { focus: 0, honkTrim: 0, driveDb: 0, wet: 0 };
    this.aiHighRepairBase = { amount: 0, velvet: 0, airWet: 0, sideWet: 0, sideAir: 0 };
    this.aiHighRepairMeter = 0;
    this.dopamineToneMap = createDefaultDopamineToneMap();
    this.lastDopamineToneAt = 0;
    this.monitoringActive = false;
    this.monitoringOutputTap = null;
    this.graphRebuildPromise = null;
    this.retiredEqNodes = [];
    this.outputShellConnected = false;
    this.timeBufferIn = null;
    this.timeBufferInputLeft = null;
    this.timeBufferInputRight = null;
    this.timeBufferOut = null;
    this.timeBufferLeft = null;
    this.timeBufferRight = null;
    this.inputFrequencyData = null;
    this.outputFrequencyData = null;
    this.performanceMode = normalizePerformanceMode(this.state.performance?.mode || DEFAULT_PERFORMANCE_MODE);
    this.rtaFftSize = chooseRtaFftSize(this.performanceMode);
    this.meterFftSize = chooseMeterFftSize(this.performanceMode);
    this.lastRtaFrame = { source: 'sfeq-rta-v93', pointCount: RTA_POINT_COUNT, input: [], output: [], updatedAt: 0 };
    this.lastMeterAt = 0;
    this.lastAdaptiveFrameAt = 0;
    this.adaptiveAudioTimer = null;
  }

  async start(streamId, tabId, sourceTitle, initialState = null) {
    await this.stop(false);
    try {
      if (initialState) {
        const { presets, ...initialBase } = initialState;
        this.state = this.prepareState({ ...createDefaultState(), ...initialBase, active: false, tabId: null });
      }

      this.widthAdaptiveFactor = 0.35;
      this.colorStereoAdaptive = 0.85;
      this.performanceMode = normalizePerformanceMode(this.state.performance?.mode || DEFAULT_PERFORMANCE_MODE);
      this.rtaFftSize = chooseRtaFftSize(this.performanceMode);
      this.meterFftSize = chooseMeterFftSize(this.performanceMode);

      const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextCtor) throw new Error('Web Audio API is not available in this browser.');

      this.context = new AudioContextCtor({ latencyHint: 'playback' });
      this.stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS(streamId));
      this.source = this.context.createMediaStreamSource(this.stream);

      this.inputGain = this.context.createGain();
      this.smartHeadroomGain = this.context.createGain();
      this.smartMakeupGain = this.context.createGain();
      this.safetyHighPass = this.context.createBiquadFilter();
      this.safetyHighPass.type = 'highpass';
      this.safetyHighPass.frequency.value = 18;
      this.safetyHighPass.Q.value = 0.707;

      this.eqNodeGroups = this.state.eq.map((band) => this.createEqNodeGroup(band));
      this.createCompressorNodes();
      this.createColorNodes();
      this.createWidthNodes();

      this.limiterDrive = this.context.createGain();
      this.softClipper = this.context.createWaveShaper();
      this.softClipper.curve = makeSoftClipCurve(0.94);
      this.softClipper.oversample = getPerfConfig(this.performanceMode).shaperOversample;

      this.limiter = this.context.createDynamicsCompressor();
      this.limiter.threshold.value = this.state.output.limiterCeiling;
      this.limiter.knee.value = this.state.output.punchProtect ? 3 : 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = this.state.output.punchProtect ? 0.004 : 0.0015;
      this.limiter.release.value = this.state.output.punchProtect ? 0.08 : 0.055;

      this.outputGain = this.context.createGain();
      this.bypassGain = this.context.createGain();
      this.processedGain = this.context.createGain();
      this.outputMixGain = this.context.createGain();
      this.rtaFftSize = chooseRtaFftSize(this.performanceMode);
      this.meterFftSize = chooseMeterFftSize(this.performanceMode);
      if (this.monitoringActive) this.createMonitoringNodes();

      this.applyAllParams();
      this.connectGraph();
      await this.context.resume();

      this.state = { ...this.state, active: true, tabId, sourceTitle: sourceTitle || 'Current tab', updatedAt: Date.now() };
      if (this.monitoringActive) {
        this.runAdaptiveAudioFrame({ force: true, includeStereoBands: true });
        this.startAdaptiveAudioLoop();
      }
      notifyStateChanged(this.getPublicState());
    } catch (error) {
      // If startup fails after getUserMedia() succeeds, Chrome keeps the tab capture
      // stream alive unless we explicitly stop it. That makes the next click fail with
      // "Cannot capture a tab with an active stream." Always release partial startup
      // resources before rethrowing the real root error.
      await this.stop(false).catch(() => {});
      this.state = { ...this.state, active: false, tabId: null, sourceTitle: 'No active capture', updatedAt: Date.now() };
      notifyStateChanged(this.getPublicState());
      throw error;
    }
  }

  async stop(notify = true) {
    this.stopAdaptiveAudioLoop();
    this.destroyMonitoringNodes();
    if (this.stream) this.stream.getTracks().forEach((track) => track.stop());
    for (const node of this.getAllNodes()) {
      try { node.disconnect(); } catch {}
    }
    if (this.context && this.context.state !== 'closed') await this.context.close().catch(() => {});

    this.context = null;
    this.stream = null;
    this.source = null;
    this.inputGain = null;
    this.smartHeadroomGain = null;
    this.smartMakeupGain = null;
    this.smartHeadroomDb = 0;
    this.smartMakeupDb = 0;
    this.inputChannelSplitter = null;
    this.inputLeftAnalyser = null;
    this.inputRightAnalyser = null;
    this.safetyHighPass = null;
    this.eqNodeGroups = [];
    this.compNodes = {};
    this.colorNodes = {};
    this.widthNodes = {};
    this.compressor = null;
    this.makeupGain = null;
    this.limiter = null;
    this.limiterDrive = null;
    this.softClipper = null;
    this.outputGain = null;
    this.bypassGain = null;
    this.processedGain = null;
    this.outputMixGain = null;
    this.inputAnalyser = null;
    this.outputAnalyser = null;
    this.correlationSplitter = null;
    this.leftAnalyser = null;
    this.rightAnalyser = null;
    this.meterSink = null;
    this.stereoBands = [];
    this.widthAdaptiveFactor = 0.35;
    this.colorStereoAdaptive = 0.85;
    this.sideMidBase = { presence: 0, tone: 0, driveDb: 0, wet: 0 };
    this.vocalTickleBase = { focus: 0, guardTrim: 0, driveDb: 0, wet: 0 };
    this.godParticleBase = { sideWet: 0, midWet: 0, driveDb: 0, shimmer: 0, guard: 0, midSparkle: 0, bassPower: 0 };
    this.trebleSkinBase = { focus: 0, tone: 0, driveDb: 0, wet: 0 };
    this.midAnchorBase = { peak: 0, tone: 0, driveDb: 0, wet: 0 };
    this.midProjectionBase = { body: 0, focus: 0, nasalTrim: 0, shoutTrim: 0, driveDb: 0, wet: 0, sideTuck: 0 };
    this.lowMidBodyBase = { focus: 0, mudTrim: 0, driveDb: 0, wet: 0 };
    this.upperMidBodyBase = { focus: 0, honkTrim: 0, driveDb: 0, wet: 0 };
    this.aiHighRepairBase = { amount: 0, velvet: 0, airWet: 0, sideWet: 0, sideAir: 0 };
    this.aiHighRepairMeter = 0;
    this.dopamineToneMap = createDefaultDopamineToneMap();
    this.lastDopamineToneAt = 0;
    this.monitoringOutputTap = null;
    this.graphRebuildPromise = null;
    this.retiredEqNodes = [];
    this.outputShellConnected = false;
    this.timeBufferIn = null;
    this.timeBufferInputLeft = null;
    this.timeBufferInputRight = null;
    this.timeBufferOut = null;
    this.timeBufferLeft = null;
    this.timeBufferRight = null;
    this.inputFrequencyData = null;
    this.outputFrequencyData = null;
    this.lastRtaFrame = { source: 'sfeq-rta-v93', pointCount: RTA_POINT_COUNT, input: [], output: [], updatedAt: 0 };
    this.lastMeterAt = 0;
    this.lastAdaptiveFrameAt = 0;

    this.state = {
      ...this.state,
      active: false,
      tabId: null,
      sourceTitle: 'No active capture',
      meters: {
        inputPeak: 0,
        outputPeak: 0,
        gainReduction: 0,
        compressorGainReduction: 0,
        compressorGainReductionLeft: 0,
        compressorGainReductionRight: 0,
        limiterGainReduction: 0,
        inputPeakLeft: 0,
        inputPeakRight: 0,
        outputPeakLeft: 0,
        outputPeakRight: 0,
        correlation: 1,
        clipping: false,
        smartHeadroomDb: 0,
        smartMakeupDb: 0
      },
      updatedAt: Date.now()
    };
    if (notify) notifyStateChanged(this.getPublicState());
  }

  prepareState(state) {
    return {
      ...createDefaultState(),
      ...state,
      eq: normalizeEqBands(state.eq),
      compressor: normalizeCompressor(state.compressor),
      color: normalizeColor(state.color),
      width: normalizeWidth(state.width),
      output: normalizeOutput(state.output),
      performance: {
        ...(state.performance || {}),
        mode: normalizePerformanceMode(state.performance?.mode || DEFAULT_PERFORMANCE_MODE)
      }
    };
  }

  createCompressorNodes() {
    this.compNodes = {
      input: this.context.createGain(),
      dry: this.context.createGain(),
      wet: this.context.createGain(),
      output: this.context.createGain()
    };
    this.compressor = this.context.createDynamicsCompressor();
    this.makeupGain = this.context.createGain();
  }

  createColorNodes() {
    this.colorNodes = {
      input: this.context.createGain(),
      dry: this.context.createGain(),
      output: this.context.createGain(),

      // Psychoacoustic bass enhancer path.
      // Low fundamentals are lightly saturated, then filtered back into the
      // 80–650 Hz range so small speakers get audible upper-bass harmonics
      // instead of unsafe sub boost.
      bassPre: this.context.createBiquadFilter(),
      bassDrive: this.context.createGain(),
      bassShaper: this.context.createWaveShaper(),
      bassPostHighpass: this.context.createBiquadFilter(),
      bassPostLowpass: this.context.createBiquadFilter(),
      bassPunch: this.context.createBiquadFilter(),
      bassWet: this.context.createGain(),

      // Warmth/density path for body and midrange thickness.
      warmPre: this.context.createBiquadFilter(),
      warmDrive: this.context.createGain(),
      warmShaper: this.context.createWaveShaper(),
      warmDcBlock: this.context.createBiquadFilter(),
      warmTone: this.context.createBiquadFilter(),
      warmWet: this.context.createGain(),

      // Presence lift path: a focused, parallel 2.6–5 kHz enhancer that makes
      // vocals, guitars and percussion step forward without full-band fuzz.
      presencePre: this.context.createBiquadFilter(),
      presenceDrive: this.context.createGain(),
      presenceShaper: this.context.createWaveShaper(),
      presenceTone: this.context.createBiquadFilter(),
      presenceWet: this.context.createGain(),

      // Air/exciter path, deliberately high-passed so it adds clarity without
      // dragging noise and harsh low-mid grit into the result.
      airPre: this.context.createBiquadFilter(),
      airDrive: this.context.createGain(),
      airShaper: this.context.createWaveShaper(),
      airDcBlock: this.context.createBiquadFilter(),
      airTone: this.context.createBiquadFilter(),
      airWet: this.context.createGain(),

      // Color v4 side-air path. This is not a plain stereo widener: it extracts
      // the Side channel, excites only upper-mid/treble content, then folds it
      // back as +Side/-Side so mono bass and centered vocals stay stable.
      sideSplitter: this.context.createChannelSplitter(2),
      sideBus: this.context.createGain(),
      sideFromL: this.context.createGain(),
      sideFromR: this.context.createGain(),
      sideHighpass: this.context.createBiquadFilter(),
      sidePresence: this.context.createBiquadFilter(),
      sideDrive: this.context.createGain(),
      sideShaper: this.context.createWaveShaper(),
      sideTone: this.context.createBiquadFilter(),
      sideWet: this.context.createGain(),
      sideToL: this.context.createGain(),
      sideToR: this.context.createGain(),
      sideMerger: this.context.createChannelMerger(2),

      // Color v10 real-side MID harmonic exciter. Unlike the Width module (which
      // synthesises side from the mono sum), this lifts the GENUINE L-R stereo
      // detail in the ~0.7-4.5 kHz "tickle" band with harmonics + a presence EQ,
      // then folds it back antisymmetrically (+Side/-Side) so it cancels perfectly
      // in the mono sum -> more alive mid stereo with zero phase issue.
      sideMidHighpass: this.context.createBiquadFilter(),
      sideMidLowpass: this.context.createBiquadFilter(),
      sideMidPresence: this.context.createBiquadFilter(),
      sideMidDrive: this.context.createGain(),
      sideMidShaper: this.context.createWaveShaper(),
      sideMidTone: this.context.createBiquadFilter(),
      sideMidWet: this.context.createGain(),

      // Color v12 MID-center sweet anchor. The side exciter gives the ears
      // movement; this parallel Mid path gives it a stable center core. It is
      // generated from (L+R)/2 and returned equally to L/R, so it never creates
      // inter-channel phase rotation or hollow stereo imaging.
      midAnchorFromL: this.context.createGain(),
      midAnchorFromR: this.context.createGain(),
      midAnchorBus: this.context.createGain(),
      midAnchorHighpass: this.context.createBiquadFilter(),
      midAnchorLowpass: this.context.createBiquadFilter(),
      midAnchorFocus: this.context.createBiquadFilter(),
      midAnchorDrive: this.context.createGain(),
      midAnchorShaper: this.context.createWaveShaper(),
      midAnchorTone: this.context.createBiquadFilter(),
      midAnchorWet: this.context.createGain(),
      midAnchorToL: this.context.createGain(),
      midAnchorToR: this.context.createGain(),

      // Color v13 coherent low-mid body anchor. This supports the vocal chest /
      // instrument body area around 200-300 Hz, but keeps the layer centered
      // (+Mid/+Mid) and guarded against 330-520 Hz mud/boxiness. It makes the
      // center feel thicker without stereo phase tricks.
      lowBodyFromL: this.context.createGain(),
      lowBodyFromR: this.context.createGain(),
      lowBodyBus: this.context.createGain(),
      lowBodyHighpass: this.context.createBiquadFilter(),
      lowBodyLowpass: this.context.createBiquadFilter(),
      lowBodyFocus: this.context.createBiquadFilter(),
      lowBodyMudGuard: this.context.createBiquadFilter(),
      lowBodyDrive: this.context.createGain(),
      lowBodyShaper: this.context.createWaveShaper(),
      lowBodyWet: this.context.createGain(),
      lowBodyToL: this.context.createGain(),
      lowBodyToR: this.context.createGain(),

      // v20 coherent upper vocal-body anchor. Adds a very small, smart center
      // support around 560-680 Hz so vocal/piano/guitar body stays present, but
      // ducks itself when the 650-950 Hz zone is already honky or resonant.
      upperBodyFromL: this.context.createGain(),
      upperBodyFromR: this.context.createGain(),
      upperBodyBus: this.context.createGain(),
      upperBodyHighpass: this.context.createBiquadFilter(),
      upperBodyLowpass: this.context.createBiquadFilter(),
      upperBodyFocus: this.context.createBiquadFilter(),
      upperBodyHonkGuard: this.context.createBiquadFilter(),
      upperBodyDrive: this.context.createGain(),
      upperBodyShaper: this.context.createWaveShaper(),
      upperBodyWet: this.context.createGain(),
      upperBodyToL: this.context.createGain(),
      upperBodyToR: this.context.createGain(),

      // v22 coherent vocal tickle anchor. Adds a tiny, centered 1.05-1.25 kHz
      // throat/formant lift so vocals stay tactile and audible when bass is
      // thick. A companion guard ducks 1.25-1.55 kHz if the source becomes
      // honky/nasal, so the lift feels sweet instead of telephone-like.
      vocalTickleFromL: this.context.createGain(),
      vocalTickleFromR: this.context.createGain(),
      vocalTickleBus: this.context.createGain(),
      vocalTickleHighpass: this.context.createBiquadFilter(),
      vocalTickleLowpass: this.context.createBiquadFilter(),
      vocalTickleFocus: this.context.createBiquadFilter(),
      vocalTickleResGuard: this.context.createBiquadFilter(),
      vocalTickleDrive: this.context.createGain(),
      vocalTickleShaper: this.context.createWaveShaper(),
      vocalTickleWet: this.context.createGain(),
      vocalTickleToL: this.context.createGain(),
      vocalTickleToR: this.context.createGain(),

      // v28 Mid Projection Engine. This is a coherent +Mid/+Mid forward layer,
      // not a loud EQ insert. It lifts body/presence in the center, trims nasal
      // and shout bands, and adds a tiny mid-side tuck so vocal/guitar/snare feel
      // closer to the listener without making the stereo image small or harsh.
      midProjectHighpass: this.context.createBiquadFilter(),
      midProjectLowpass: this.context.createBiquadFilter(),
      midProjectBody: this.context.createBiquadFilter(),
      midProjectFocus: this.context.createBiquadFilter(),
      midProjectNasalGuard: this.context.createBiquadFilter(),
      midProjectShoutGuard: this.context.createBiquadFilter(),
      midProjectDrive: this.context.createGain(),
      midProjectShaper: this.context.createWaveShaper(),
      midProjectWet: this.context.createGain(),
      midProjectToL: this.context.createGain(),
      midProjectToR: this.context.createGain(),
      // v29 Mid Projection Body Branch. Keep the 330-470 Hz body layer on a
      // separate, lower bandpass path so it is not removed by the 720-1040 Hz
      // focus high-pass. This gives projection with daging/body, not only bite.
      midProjectBodyHighpass: this.context.createBiquadFilter(),
      midProjectBodyLowpass: this.context.createBiquadFilter(),
      midProjectBodyMudGuard: this.context.createBiquadFilter(),
      midProjectBodyDrive: this.context.createGain(),
      midProjectBodyShaper: this.context.createWaveShaper(),
      midProjectBodyWet: this.context.createGain(),
      midProjectBodyToL: this.context.createGain(),
      midProjectBodyToR: this.context.createGain(),
      sideTuckHighpass: this.context.createBiquadFilter(),
      sideTuckLowpass: this.context.createBiquadFilter(),
      sideTuckFocus: this.context.createBiquadFilter(),
      sideTuckWet: this.context.createGain(),
      sideTuckToL: this.context.createGain(),
      sideTuckToR: this.context.createGain(),

      // v18 Segment-Aware AI Artifact Guard. AI music artifacts do not live in
      // one generic high band: 1-3 kHz can become nasal, 3-5 kHz can become
      // papery/zingy, 6-8 kHz can become edge/glass, 8-10 kHz can
      // become grain/splash, and 10-12 kHz can become sandy sheen/chirp entrance. Keep each segment separate so repair stays musical and
      // avoids the dull/warm blanket behavior of broad high attenuation.
      aiRepairPresence: this.context.createBiquadFilter(),
      aiRepairTickle: this.context.createBiquadFilter(),
      aiRepairDeHarsh: this.context.createBiquadFilter(),
      // v27 6-12 kHz treble-silk micro-split guard. This band is not one sound: 6 kHz is
      // edge/ess, 7 kHz is glass/etch, 8-10 kHz is grain/splash, and
      // 10-12 kHz is sandy sheen/chirp entrance. Splitting it prevents the dull
      // blanket effect while still catching AI krisik around cymbal and vocal air.
      aiRepairEdge: this.context.createBiquadFilter(),
      aiRepairGlass: this.context.createBiquadFilter(),
      aiRepairGrain: this.context.createBiquadFilter(),
      aiRepairSplash: this.context.createBiquadFilter(),
      aiRepairChirp: this.context.createBiquadFilter(),
      aiRepairFizz: this.context.createBiquadFilter(),
      aiRepairAirShelf: this.context.createBiquadFilter(),

      // v17 Natural Air Rebuilder. The first AI High Repair was intentionally
      // safe but could sound too warm because it attenuated the whole top shelf.
      // This path rebuilds a tiny, smooth air layer from the more stable
      // 3-6 kHz presence band after the chirp/splash notches, so damaged AI
      // cymbal fizz is reduced while the final tone still feels open and real.
      aiSilkSource: this.context.createBiquadFilter(),
      aiSilkDrive: this.context.createGain(),
      aiSilkShaper: this.context.createWaveShaper(),
      aiSilkHighpass: this.context.createBiquadFilter(),
      aiSilkLowpass: this.context.createBiquadFilter(),
      aiSilkTone: this.context.createBiquadFilter(),
      aiSilkWet: this.context.createGain(),
      // v21 Pleasant Edge Rebuilder. A tiny parallel harmonic layer derived from
      // the more stable 4-5.6 kHz region, folded back in the 6.4-7.8 kHz zone so
      // the guard removes AI grain without making vocal air/cymbal edge sink.
      aiEdgeSource: this.context.createBiquadFilter(),
      aiEdgeDrive: this.context.createGain(),
      aiEdgeShaper: this.context.createWaveShaper(),
      aiEdgeTone: this.context.createBiquadFilter(),
      aiEdgeWet: this.context.createGain(),

      // v0.3.96 Treble Clarity Skin. A tiny coherent +Mid/+Mid layer around
      // 8.75 kHz restores real skin/detail in the fragile 6-10 kHz band without
      // widening it. Side air stays above this zone to avoid phasey treble.
      trebleSkinBand: this.context.createBiquadFilter(),
      trebleSkinDrive: this.context.createGain(),
      trebleSkinShaper: this.context.createWaveShaper(),
      trebleSkinTone: this.context.createBiquadFilter(),
      trebleSkinWet: this.context.createGain(),
      trebleSkinToL: this.context.createGain(),
      trebleSkinToR: this.context.createGain(),

      // v25 Smart God Particles+. Micro harmonic particles are no longer only
      // side/air. The center path also touches the upper-mid presence band so
      // vocal/snare/piano sparkle stands forward, while bass punch harmonics
      // help small speakers perceive more power without adding sub pressure.
      godSideHighpass: this.context.createBiquadFilter(),
      godSideFocus: this.context.createBiquadFilter(),
      godSideDrive: this.context.createGain(),
      godSideShaper: this.context.createWaveShaper(),
      godSideTone: this.context.createBiquadFilter(),
      godSideWet: this.context.createGain(),
      godSideToL: this.context.createGain(),
      godSideToR: this.context.createGain(),
      godMidHighpass: this.context.createBiquadFilter(),
      godMidFocus: this.context.createBiquadFilter(),
      godMidDrive: this.context.createGain(),
      godMidShaper: this.context.createWaveShaper(),
      godMidTone: this.context.createBiquadFilter(),
      godMidWet: this.context.createGain(),
      godMidToL: this.context.createGain(),
      godMidToR: this.context.createGain(),
      aiRepairOutput: this.context.createGain(),

      // Compatibility nodes for older state snapshots and docs.
      drive: this.context.createGain(),
      body: this.context.createBiquadFilter(),
      warmth: this.context.createBiquadFilter(),
      shaper: this.context.createWaveShaper(),
      air: this.context.createBiquadFilter(),
      wet: this.context.createGain()
    };

    const c = this.colorNodes;
    c.bassPre.type = 'lowpass';
    c.bassPre.frequency.value = 145;
    c.bassPre.Q.value = 0.72;
    c.bassPostHighpass.type = 'highpass';
    c.bassPostHighpass.frequency.value = 72;
    c.bassPostHighpass.Q.value = 0.707;
    c.bassPostLowpass.type = 'lowpass';
    c.bassPostLowpass.frequency.value = 680;
    c.bassPostLowpass.Q.value = 0.707;
    c.bassPunch.type = 'peaking';
    c.bassPunch.frequency.value = 185;
    c.bassPunch.Q.value = 0.85;
    c.bassShaper.oversample = '2x';

    c.warmPre.type = 'bandpass';
    c.warmPre.frequency.value = 520;
    c.warmPre.Q.value = 0.65;
    c.warmDcBlock.type = 'highpass';
    c.warmDcBlock.frequency.value = 22;
    c.warmDcBlock.Q.value = 0.707;
    c.warmTone.type = 'peaking';
    c.warmTone.frequency.value = 720;
    c.warmTone.Q.value = 0.75;
    c.warmShaper.oversample = '2x';

    c.presencePre.type = 'bandpass';
    c.presencePre.frequency.value = 3200;
    c.presencePre.Q.value = 0.82;
    c.presenceTone.type = 'peaking';
    c.presenceTone.frequency.value = 4300;
    c.presenceTone.Q.value = 0.72;
    c.presenceShaper.oversample = '2x';

    c.airPre.type = 'highpass';
    c.airPre.frequency.value = 5200;
    c.airPre.Q.value = 0.707;
    c.airDcBlock.type = 'highpass';
    c.airDcBlock.frequency.value = 900;
    c.airDcBlock.Q.value = 0.707;
    c.airTone.type = 'highshelf';
    c.airTone.frequency.value = 9200;
    c.airTone.Q.value = 0.7;
    c.airShaper.oversample = '2x';

    c.sideFromL.gain.value = 0.5;
    c.sideFromR.gain.value = -0.5;
    c.sideHighpass.type = 'highpass';
    c.sideHighpass.frequency.value = 4300;
    c.sideHighpass.Q.value = 0.74;
    c.sidePresence.type = 'peaking';
    c.sidePresence.frequency.value = 6100;
    c.sidePresence.Q.value = 0.85;
    c.sideTone.type = 'highshelf';
    c.sideTone.frequency.value = 9200;
    c.sideTone.Q.value = 0.65;
    c.sideToL.gain.value = 1;
    c.sideToR.gain.value = -1;
    c.sideShaper.oversample = 'none';

    // Real-side mid exciter: keep low mono (HPF 220 Hz), focus the mid/mid-high
    // "tickle" band, 2x oversampling so mid harmonics never alias into harshness.
    c.sideMidHighpass.type = 'highpass';
    c.sideMidHighpass.frequency.value = 220;
    c.sideMidHighpass.Q.value = 0.707;
    c.sideMidLowpass.type = 'lowpass';
    c.sideMidLowpass.frequency.value = 4800;
    c.sideMidLowpass.Q.value = 0.707;
    c.sideMidPresence.type = 'peaking';
    c.sideMidPresence.frequency.value = 2600;
    c.sideMidPresence.Q.value = 0.72;
    c.sideMidTone.type = 'peaking';
    c.sideMidTone.frequency.value = 3800;
    c.sideMidTone.Q.value = 0.72;
    c.sideMidShaper.oversample = '2x';
    c.sideMidWet.gain.value = 0;

    c.midAnchorFromL.gain.value = 0.5;
    c.midAnchorFromR.gain.value = 0.5;
    c.midAnchorHighpass.type = 'highpass';
    c.midAnchorHighpass.frequency.value = 620;
    c.midAnchorHighpass.Q.value = 0.707;
    c.midAnchorLowpass.type = 'lowpass';
    c.midAnchorLowpass.frequency.value = 4600;
    c.midAnchorLowpass.Q.value = 0.707;
    c.midAnchorFocus.type = 'peaking';
    c.midAnchorFocus.frequency.value = 1850;
    c.midAnchorFocus.Q.value = 0.56;
    c.midAnchorTone.type = 'peaking';
    c.midAnchorTone.frequency.value = 3150;
    c.midAnchorTone.Q.value = 0.58;
    c.midAnchorShaper.oversample = '2x';
    c.midAnchorWet.gain.value = 0;
    c.midAnchorToL.gain.value = 1;
    c.midAnchorToR.gain.value = 1;

    c.lowBodyFromL.gain.value = 0.5;
    c.lowBodyFromR.gain.value = 0.5;
    c.lowBodyHighpass.type = 'highpass';
    c.lowBodyHighpass.frequency.value = 138;
    c.lowBodyHighpass.Q.value = 0.707;
    c.lowBodyLowpass.type = 'lowpass';
    c.lowBodyLowpass.frequency.value = 365;
    c.lowBodyLowpass.Q.value = 0.707;
    c.lowBodyFocus.type = 'peaking';
    c.lowBodyFocus.frequency.value = 255;
    c.lowBodyFocus.Q.value = 0.46;
    c.lowBodyMudGuard.type = 'peaking';
    c.lowBodyMudGuard.frequency.value = 385;
    c.lowBodyMudGuard.Q.value = 0.62;
    c.lowBodyShaper.oversample = '2x';
    c.lowBodyWet.gain.value = 0;
    c.lowBodyToL.gain.value = 1;
    c.lowBodyToR.gain.value = 1;

    c.upperBodyFromL.gain.value = 0.5;
    c.upperBodyFromR.gain.value = 0.5;
    c.upperBodyHighpass.type = 'highpass';
    c.upperBodyHighpass.frequency.value = 300;
    c.upperBodyHighpass.Q.value = 0.707;
    c.upperBodyLowpass.type = 'lowpass';
    c.upperBodyLowpass.frequency.value = 1050;
    c.upperBodyLowpass.Q.value = 0.707;
    c.upperBodyFocus.type = 'peaking';
    c.upperBodyFocus.frequency.value = 600;
    c.upperBodyFocus.Q.value = 0.58;
    c.upperBodyHonkGuard.type = 'peaking';
    c.upperBodyHonkGuard.frequency.value = 780;
    c.upperBodyHonkGuard.Q.value = 0.78;
    c.upperBodyShaper.oversample = '2x';
    c.upperBodyWet.gain.value = 0;
    c.upperBodyToL.gain.value = 1;
    c.upperBodyToR.gain.value = 1;

    c.vocalTickleFromL.gain.value = 0.5;
    c.vocalTickleFromR.gain.value = 0.5;
    c.vocalTickleHighpass.type = 'highpass';
    c.vocalTickleHighpass.frequency.value = 780;
    c.vocalTickleHighpass.Q.value = 0.707;
    c.vocalTickleLowpass.type = 'lowpass';
    c.vocalTickleLowpass.frequency.value = 1550;
    c.vocalTickleLowpass.Q.value = 0.707;
    c.vocalTickleFocus.type = 'peaking';
    c.vocalTickleFocus.frequency.value = 1150;
    c.vocalTickleFocus.Q.value = 0.62;
    c.vocalTickleResGuard.type = 'peaking';
    c.vocalTickleResGuard.frequency.value = 1380;
    c.vocalTickleResGuard.Q.value = 0.86;
    c.vocalTickleShaper.oversample = '2x';
    c.vocalTickleWet.gain.value = 0;
    c.vocalTickleToL.gain.value = 1;
    c.vocalTickleToR.gain.value = 1;

    c.midProjectHighpass.type = 'highpass';
    c.midProjectHighpass.frequency.value = 820;
    c.midProjectHighpass.Q.value = 0.707;
    c.midProjectLowpass.type = 'lowpass';
    c.midProjectLowpass.frequency.value = 3600;
    c.midProjectLowpass.Q.value = 0.707;
    c.midProjectBody.type = 'peaking';
    c.midProjectBody.frequency.value = 390;
    c.midProjectBody.Q.value = 0.72;
    c.midProjectBody.gain.value = 0;
    c.midProjectFocus.type = 'peaking';
    c.midProjectFocus.frequency.value = 2050;
    c.midProjectFocus.Q.value = 0.58;
    c.midProjectFocus.gain.value = 0;
    c.midProjectNasalGuard.type = 'peaking';
    c.midProjectNasalGuard.frequency.value = 980;
    c.midProjectNasalGuard.Q.value = 0.82;
    c.midProjectNasalGuard.gain.value = 0;
    c.midProjectShoutGuard.type = 'peaking';
    c.midProjectShoutGuard.frequency.value = 3650;
    c.midProjectShoutGuard.Q.value = 0.76;
    c.midProjectShoutGuard.gain.value = 0;
    c.midProjectShaper.oversample = '2x';
    c.midProjectWet.gain.value = 0;
    c.midProjectToL.gain.value = 1;
    c.midProjectToR.gain.value = 1;
    c.midProjectBodyHighpass.type = 'highpass';
    c.midProjectBodyHighpass.frequency.value = 285;
    c.midProjectBodyHighpass.Q.value = 0.707;
    c.midProjectBodyLowpass.type = 'lowpass';
    c.midProjectBodyLowpass.frequency.value = 720;
    c.midProjectBodyLowpass.Q.value = 0.707;
    c.midProjectBodyMudGuard.type = 'peaking';
    c.midProjectBodyMudGuard.frequency.value = 560;
    c.midProjectBodyMudGuard.Q.value = 0.78;
    c.midProjectBodyMudGuard.gain.value = 0;
    c.midProjectBodyDrive.gain.value = 1;
    c.midProjectBodyShaper.oversample = '2x';
    c.midProjectBodyWet.gain.value = 0;
    c.midProjectBodyToL.gain.value = 1;
    c.midProjectBodyToR.gain.value = 1;
    c.sideTuckHighpass.type = 'highpass';
    c.sideTuckHighpass.frequency.value = 620;
    c.sideTuckHighpass.Q.value = 0.707;
    c.sideTuckLowpass.type = 'lowpass';
    c.sideTuckLowpass.frequency.value = 3150;
    c.sideTuckLowpass.Q.value = 0.707;
    c.sideTuckFocus.type = 'peaking';
    c.sideTuckFocus.frequency.value = 1850;
    c.sideTuckFocus.Q.value = 0.64;
    c.sideTuckFocus.gain.value = 0;
    c.sideTuckWet.gain.value = 0;
    c.sideTuckToL.gain.value = -1;
    c.sideTuckToR.gain.value = 1;

    c.aiRepairPresence.type = 'peaking';
    c.aiRepairPresence.frequency.value = 2300;
    c.aiRepairPresence.Q.value = 0.58;
    c.aiRepairPresence.gain.value = 0;
    c.aiRepairTickle.type = 'peaking';
    c.aiRepairTickle.frequency.value = 4200;
    c.aiRepairTickle.Q.value = 0.68;
    c.aiRepairTickle.gain.value = 0;
    c.aiRepairDeHarsh.type = 'peaking';
    c.aiRepairDeHarsh.frequency.value = 5600;
    c.aiRepairDeHarsh.Q.value = 0.86;
    c.aiRepairDeHarsh.gain.value = 0;
    c.aiRepairEdge.type = 'peaking';
    c.aiRepairEdge.frequency.value = 6250;
    c.aiRepairEdge.Q.value = 1.12;
    c.aiRepairEdge.gain.value = 0;
    c.aiRepairGlass.type = 'peaking';
    c.aiRepairGlass.frequency.value = 7050;
    c.aiRepairGlass.Q.value = 1.22;
    c.aiRepairGlass.gain.value = 0;
    c.aiRepairGrain.type = 'peaking';
    c.aiRepairGrain.frequency.value = 7850;
    c.aiRepairGrain.Q.value = 1.08;
    c.aiRepairGrain.gain.value = 0;
    c.aiRepairSplash.type = 'peaking';
    c.aiRepairSplash.frequency.value = 8800;
    c.aiRepairSplash.Q.value = 1.02;
    c.aiRepairSplash.gain.value = 0;
    c.aiRepairChirp.type = 'peaking';
    c.aiRepairChirp.frequency.value = 11200;
    c.aiRepairChirp.Q.value = 0.86;
    c.aiRepairChirp.gain.value = 0;
    c.aiRepairFizz.type = 'peaking';
    c.aiRepairFizz.frequency.value = 14200;
    c.aiRepairFizz.Q.value = 0.68;
    c.aiRepairFizz.gain.value = 0;
    c.aiRepairAirShelf.type = 'highshelf';
    c.aiRepairAirShelf.frequency.value = 11800;
    c.aiRepairAirShelf.Q.value = 0.62;
    c.aiRepairAirShelf.gain.value = 0;
    c.aiSilkSource.type = 'bandpass';
    c.aiSilkSource.frequency.value = 4200;
    c.aiSilkSource.Q.value = 0.55;
    c.aiSilkShaper.oversample = '2x';
    c.aiSilkHighpass.type = 'highpass';
    c.aiSilkHighpass.frequency.value = 9400;
    c.aiSilkHighpass.Q.value = 0.707;
    c.aiSilkLowpass.type = 'lowpass';
    c.aiSilkLowpass.frequency.value = 17800;
    c.aiSilkLowpass.Q.value = 0.707;
    c.aiSilkTone.type = 'highshelf';
    c.aiSilkTone.frequency.value = 12400;
    c.aiSilkTone.Q.value = 0.55;
    c.aiSilkTone.gain.value = 0;
    c.aiSilkWet.gain.value = 0;
    c.aiEdgeSource.type = 'bandpass';
    c.aiEdgeSource.frequency.value = 4900;
    c.aiEdgeSource.Q.value = 0.48;
    c.aiEdgeShaper.oversample = '2x';
    c.aiEdgeTone.type = 'bandpass';
    c.aiEdgeTone.frequency.value = 6900;
    c.aiEdgeTone.Q.value = 0.62;
    c.aiEdgeWet.gain.value = 0;

    c.godSideHighpass.type = 'highpass';
    c.godSideHighpass.frequency.value = 8400;
    c.godSideHighpass.Q.value = 0.707;
    c.godSideFocus.type = 'peaking';
    c.godSideFocus.frequency.value = 11200;
    c.godSideFocus.Q.value = 0.82;
    c.godSideDrive.gain.value = 1;
    c.godSideShaper.oversample = '2x';
    c.godSideTone.type = 'highshelf';
    c.godSideTone.frequency.value = 13200;
    c.godSideTone.Q.value = 0.52;
    c.godSideTone.gain.value = 0;
    c.godSideWet.gain.value = 0;
    c.godSideToL.gain.value = 1;
    c.godSideToR.gain.value = -1;

    c.godMidHighpass.type = 'highpass';
    c.godMidHighpass.frequency.value = 1900;
    c.godMidHighpass.Q.value = 0.707;
    c.godMidFocus.type = 'peaking';
    c.godMidFocus.frequency.value = 3150;
    c.godMidFocus.Q.value = 0.54;
    c.godMidDrive.gain.value = 1;
    c.godMidShaper.oversample = '2x';
    c.godMidTone.type = 'highshelf';
    c.godMidTone.frequency.value = 9800;
    c.godMidTone.Q.value = 0.50;
    c.godMidTone.gain.value = 0;
    c.godMidWet.gain.value = 0;
    c.godMidToL.gain.value = 1;
    c.godMidToR.gain.value = 1;

    c.aiRepairOutput.gain.value = 1;

    c.body.type = 'lowshelf';
    c.body.frequency.value = 115;
    c.body.Q.value = 0.7;
    c.warmth.type = 'peaking';
    c.warmth.frequency.value = 420;
    c.warmth.Q.value = 0.85;
    c.air.type = 'highshelf';
    c.air.frequency.value = 5200;
    c.air.Q.value = 0.7;
    c.shaper.oversample = '2x';
  }

  createWidthNodes() {
    const makeGain = (value = 1) => {
      const node = this.context.createGain();
      node.gain.value = value;
      return node;
    };
    const makeFilter = (type, frequency, q = 0.707) => {
      const node = this.context.createBiquadFilter();
      node.type = type;
      node.frequency.value = frequency;
      node.Q.value = q;
      return node;
    };
    const makeBand = (name, lowType, lowFreq, highType, highFreq) => {
      const input = makeGain();
      const gain = makeGain();
      const guard = this.context.createDynamicsCompressor();
      guard.threshold.value = -16;
      guard.knee.value = 12;
      guard.ratio.value = 1.6;
      guard.attack.value = 0.012;
      guard.release.value = 0.12;
      const nodes = { input, gain, guard };
      let entry = input;
      let tail = input;
      if (lowType) {
        nodes.low = makeFilter(lowType, lowFreq, 0.707);
        tail.connect(nodes.low);
        tail = nodes.low;
      }
      if (highType) {
        nodes.high = makeFilter(highType, highFreq, 0.707);
        tail.connect(nodes.high);
        tail = nodes.high;
      }
      tail.connect(guard).connect(gain);
      return { name, entry, gain, guard, nodeMap: nodes, nodes: Object.values(nodes) };
    };

    this.widthNodes = {
      input: makeGain(),
      splitter: this.context.createChannelSplitter(2),
      merger: this.context.createChannelMerger(2),
      lDry: makeGain(1),
      rDry: makeGain(1),
      lMid: makeGain(0.5),
      rMid: makeGain(0.5),
      midBus: makeGain(),
      generatedPreHighpass: makeFilter('highpass', 180, 0.707),
      generatedPhaseA: makeFilter('allpass', 860, 0.58),
      generatedPhaseB: makeFilter('allpass', 5200, 0.70),
      lowBand: makeBand('low', null, 0, 'lowpass', 150),
      lowMidBand: makeBand('lowMid', 'highpass', 150, 'lowpass', 650),
      midBand: makeBand('mid', 'highpass', 650, 'lowpass', 4200),
      highBand: makeBand('high', 'highpass', 4200, null, 0),
      sideAirTone: makeFilter('highshelf', 9200, 0.62),
      sideToL: makeGain(0.35),
      sideToR: makeGain(-0.35)
    };
  }


  createEqNodeGroup(band) {
    if (!this.context) return [];
    const normalized = normalizeEqBands([band])[0];
    const nodeCount = isCutType(normalized.type) ? Math.max(1, Math.round((normalized.slope || 12) / 12)) : 1;
    const qValues = isCutType(normalized.type) ? (BUTTERWORTH_Q[normalized.slope] || BUTTERWORTH_Q[12]) : [normalized.q];
    return Array.from({ length: nodeCount }, (_, index) => {
      const node = this.context.createBiquadFilter();
      this.applyBandToNode(node, normalized, qValues[index] || normalized.q);
      return node;
    });
  }

  applyBandToNode(node, band, qOverride = null) {
    const enabled = band.enabled !== false;
    node.type = enabled ? toWebAudioType(band.type) : 'allpass';
    node.frequency.value = Number(band.frequency);
    node.gain.value = isCutType(band.type) ? 0 : Number(band.gain || 0);
    node.Q.value = qOverride ?? Number(band.q || 1);
  }

  reconcileEqNodeGroups(nextBands) {
    const normalized = normalizeEqBands(nextBands);
    if (!requiresEqTopologyRebuild(this.eqNodeGroups, normalized)) return false;
    this.retiredEqNodes.push(...this.getFlatEqNodes());
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

  getFlatEqNodes() {
    return this.eqNodeGroups.flat().filter(Boolean);
  }

  getFlatWidthNodes() {
    const w = this.widthNodes || {};
    const bands = [w.lowBand, w.lowMidBand, w.midBand, w.highBand].flatMap((band) => band?.nodes || []);
    return [
      w.input, w.splitter, w.merger,
      w.lDry, w.rDry, w.lMid, w.rMid, w.midBus,
      w.generatedPreHighpass, w.generatedPhaseA, w.generatedPhaseB,
      ...bands, w.sideAirTone, w.sideToL, w.sideToR
    ].filter(Boolean);
  }

  getAllNodes() {
    return [
      this.source,
      this.inputAnalyser,
      this.inputChannelSplitter,
      this.inputLeftAnalyser,
      this.inputRightAnalyser,
      this.inputGain,
      this.smartHeadroomGain,
      this.safetyHighPass,
      ...this.getFlatEqNodes(),
      ...this.retiredEqNodes,
      ...Object.values(this.compNodes || {}),
      this.compressor,
      this.makeupGain,
      ...Object.values(this.colorNodes || {}),
      ...this.getFlatWidthNodes(),
      this.smartMakeupGain,
      this.limiterDrive,
      this.softClipper,
      this.limiter,
      this.outputGain,
      this.bypassGain,
      this.processedGain,
      this.outputMixGain,
      this.outputAnalyser,
      this.correlationSplitter,
      this.leftAnalyser,
      this.rightAnalyser,
      ...this.getStereoBandNodes(),
      this.meterSink,
      this.monitoringOutputTap
    ].filter(Boolean);
  }

  ensureOutputShell() {
    if (this.outputShellConnected || !this.context || !this.source || !this.bypassGain || !this.outputMixGain) return;
    this.source.connect(this.bypassGain).connect(this.outputMixGain).connect(this.context.destination);
    this.outputShellConnected = true;
  }

  disconnectProcessingGraph() {
    // Chromium treats disconnect(null) as the zero-argument overload and removes
    // every outgoing connection. Never call the destination overload unless
    // both endpoints exist, otherwise tabCapture audio can be silenced entirely.
    if (this.source && this.inputGain) {
      try { this.source.disconnect(this.inputGain); } catch {}
    }
    const nodes = [
      this.inputGain,
      this.smartHeadroomGain,
      this.safetyHighPass,
      ...this.getFlatEqNodes(),
      ...this.retiredEqNodes,
      ...Object.values(this.compNodes || {}),
      this.compressor,
      this.makeupGain,
      ...Object.values(this.colorNodes || {}),
      ...this.getFlatWidthNodes(),
      this.smartMakeupGain,
      this.limiterDrive,
      this.softClipper,
      this.limiter,
      this.outputGain,
      this.processedGain
    ].filter(Boolean);
    for (const node of nodes) { try { node.disconnect(); } catch {} }
  }

  connectGraph({ preserveCrossfade = false } = {}) {
    if (!this.context || !this.source) return;
    const leanAudio = isLeanAudioMode(this.performanceMode);
    const isBypassed = Boolean(this.state.output.bypass);
    if (!preserveCrossfade) {
      this.bypassGain.gain.value = isBypassed ? 1 : 0;
      this.processedGain.gain.value = isBypassed ? 0 : 1;
    }
    this.outputMixGain.gain.value = 1;
    this.ensureOutputShell();
    this.disconnectProcessingGraph();

    let cursor = this.source.connect(this.inputGain).connect(this.smartHeadroomGain).connect(this.safetyHighPass);
    if (this.state.eqEnabled !== false) for (const eqNode of this.getFlatEqNodes()) cursor = cursor.connect(eqNode);
    if (this.state.compressor.enabled) cursor = this.connectCompressor(cursor);
    if (!leanAudio && this.state.color.enabled && this.state.color.mix > 0) cursor = this.connectColor(cursor);
    if (!leanAudio && this.state.width.enabled) cursor = this.connectWidth(cursor);
    if (this.smartMakeupGain) cursor = cursor.connect(this.smartMakeupGain);
    if (this.state.output.limiterEnabled) cursor = cursor.connect(this.limiterDrive).connect(this.softClipper).connect(this.limiter);
    cursor.connect(this.outputGain).connect(this.processedGain).connect(this.outputMixGain);
    this.monitoringOutputTap = this.outputMixGain;
    this.connectMonitoringTaps(this.monitoringOutputTap);
    this.retiredEqNodes = [];
  }

  createMonitoringNodes() {
    if (!this.context || this.inputAnalyser) return;
    this.inputChannelSplitter = this.context.createChannelSplitter(2);
    this.inputLeftAnalyser = this.createMeterAnalyser(); this.inputRightAnalyser = this.createMeterAnalyser();
    this.inputAnalyser = this.createRtaAnalyser(); this.outputAnalyser = this.createRtaAnalyser();
    this.leftAnalyser = this.createMeterAnalyser(); this.rightAnalyser = this.createMeterAnalyser();
    this.correlationSplitter = this.context.createChannelSplitter(2);
    this.meterSink = this.context.createGain(); this.meterSink.gain.value = 0; this.stereoBands = [];
    if (getPerfConfig(this.performanceMode).stereoBandsInAnalysis) this.createStereoBandMeters();
    this.timeBufferIn = new Float32Array(this.inputAnalyser.fftSize); this.timeBufferInputLeft = new Float32Array(this.inputLeftAnalyser.fftSize); this.timeBufferInputRight = new Float32Array(this.inputRightAnalyser.fftSize);
    this.timeBufferOut = new Float32Array(this.outputAnalyser.fftSize); this.timeBufferLeft = new Float32Array(this.leftAnalyser.fftSize); this.timeBufferRight = new Float32Array(this.rightAnalyser.fftSize);
    this.inputFrequencyData = new Float32Array(this.inputAnalyser.frequencyBinCount); this.outputFrequencyData = new Float32Array(this.outputAnalyser.frequencyBinCount);
  }

  disconnectMonitoringTaps() {
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

  destroyMonitoringNodes() {
    this.disconnectMonitoringTaps();
    this.inputChannelSplitter=this.inputLeftAnalyser=this.inputRightAnalyser=this.inputAnalyser=this.outputAnalyser=this.correlationSplitter=this.leftAnalyser=this.rightAnalyser=this.meterSink=null;
    this.stereoBands=[]; this.timeBufferIn=this.timeBufferInputLeft=this.timeBufferInputRight=this.timeBufferOut=this.timeBufferLeft=this.timeBufferRight=this.inputFrequencyData=this.outputFrequencyData=null;
    this.lastRtaFrame={source:'sfeq-rta-v93',pointCount:RTA_POINT_COUNT,input:[],output:[],updatedAt:0};
    this.state.meters = createSilentMeters();
  }

  connectMonitoringTaps(outputCursor = this.monitoringOutputTap) {
    this.disconnectMonitoringTaps();
    if (!this.monitoringActive || !this.context || !this.source || !outputCursor) return;
    this.source.connect(this.inputAnalyser); this.inputAnalyser.connect(this.meterSink);
    this.source.connect(this.inputChannelSplitter); this.inputChannelSplitter.connect(this.inputLeftAnalyser,0); this.inputChannelSplitter.connect(this.inputRightAnalyser,1); this.inputLeftAnalyser.connect(this.meterSink); this.inputRightAnalyser.connect(this.meterSink);
    outputCursor.connect(this.outputAnalyser); this.outputAnalyser.connect(this.meterSink);
    outputCursor.connect(this.correlationSplitter); this.correlationSplitter.connect(this.leftAnalyser,0); this.correlationSplitter.connect(this.rightAnalyser,1); this.leftAnalyser.connect(this.meterSink); this.rightAnalyser.connect(this.meterSink);
    this.meterSink.connect(this.context.destination);
  }

  setMonitoringActive(active) {
    const next=Boolean(active); if (this.monitoringActive===next) return; this.monitoringActive=next;
    if (!next) { this.stopAdaptiveAudioLoop(); this.destroyMonitoringNodes(); return; }
    this.createMonitoringNodes(); this.connectMonitoringTaps(); this.runAdaptiveAudioFrame({force:true,includeStereoBands:false}); this.startAdaptiveAudioLoop();
  }

  createStereoBandMeters() {
    if (!this.context) return;
    const makeFilter = (type, frequency, q = 0.707) => {
      const filter = this.context.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      return filter;
    };
    const makeBand = (id, leftTap, rightTap, leftTail = null, rightTail = null, extraNodes = []) => {
      const leftAnalyser = this.createMeterAnalyser();
      const rightAnalyser = this.createMeterAnalyser();
      return {
        id,
        leftTap,
        rightTap,
        leftTail: leftTail || leftTap,
        rightTail: rightTail || rightTap,
        leftAnalyser,
        rightAnalyser,
        leftBuffer: new Float32Array(leftAnalyser.fftSize),
        rightBuffer: new Float32Array(rightAnalyser.fftSize),
        nodes: Array.from(new Set([leftTap, rightTap, leftTail, rightTail, leftAnalyser, rightAnalyser, ...extraNodes].filter(Boolean)))
      };
    };

    const lowL = makeFilter('lowpass', 180);
    const lowR = makeFilter('lowpass', 180);
    const midLH = makeFilter('highpass', 180);
    const midLL = makeFilter('lowpass', 3200);
    const midRH = makeFilter('highpass', 180);
    const midRL = makeFilter('lowpass', 3200);
    const highL = makeFilter('highpass', 3200);
    const highR = makeFilter('highpass', 3200);

    this.stereoBands = [
      makeBand('low', lowL, lowR),
      makeBand('mid', midLH, midRH, midLL, midRL, [midLL, midRL]),
      makeBand('high', highL, highR)
    ];
  }

  getStereoBandNodes() {
    return (this.stereoBands || []).flatMap((band) => band.nodes || []);
  }

  connectCompressor(cursor) {
    const mix = clamp01((this.state.compressor.parallelMix ?? 100) / 100);
    const dryGain = Math.cos(mix * Math.PI / 2);
    const wetGain = Math.sin(mix * Math.PI / 2);
    this.compNodes.dry.gain.value = dryGain;
    this.compNodes.wet.gain.value = wetGain;

    cursor.connect(this.compNodes.input);
    this.compNodes.input.connect(this.compNodes.dry).connect(this.compNodes.output);
    this.compNodes.input.connect(this.compressor).connect(this.makeupGain).connect(this.compNodes.wet).connect(this.compNodes.output);
    return this.compNodes.output;
  }

  connectColor(cursor) {
    const c = this.colorNodes;
    const mix = clamp01((this.state.color.mix || 0) / 100);
    // Keep the dry path dominant. Color is a parallel psychoacoustic enhancer,
    // not a full-band distortion insert; this prevents hot browser audio from
    // collapsing while still adding the audible lift.
    // v0.3.94 Turbo Micro Detail Preserve: TURBO must keep the direct 1-6 kHz
    // texture that makes ECO feel detailed, then add bass/air/width as a reward layer.
    const turboClarityReward = this.performanceMode === 'normal';
    c.dry.gain.value = clamp(turboClarityReward ? 1 + mix * 0.085 : 1 - mix * 0.14, 0.96, 1.060);
    cursor.connect(c.input);
    c.input.connect(c.dry).connect(c.output);

    c.input
      .connect(c.bassPre)
      .connect(c.bassDrive)
      .connect(c.bassShaper)
      .connect(c.bassPostHighpass)
      .connect(c.bassPostLowpass)
      .connect(c.bassPunch)
      .connect(c.bassWet)
      .connect(c.output);

    c.input
      .connect(c.warmPre)
      .connect(c.warmDrive)
      .connect(c.warmShaper)
      .connect(c.warmDcBlock)
      .connect(c.warmTone)
      .connect(c.warmWet)
      .connect(c.output);

    c.input
      .connect(c.presencePre)
      .connect(c.presenceDrive)
      .connect(c.presenceShaper)
      .connect(c.presenceTone)
      .connect(c.presenceWet)
      .connect(c.output);

    c.input
      .connect(c.airPre)
      .connect(c.airDrive)
      .connect(c.airShaper)
      .connect(c.airDcBlock)
      .connect(c.airTone)
      .connect(c.airWet)
      .connect(c.output);

    c.input.connect(c.sideSplitter);
    c.sideSplitter.connect(c.sideFromL, 0);
    c.sideSplitter.connect(c.sideFromR, 1);
    c.sideFromL.connect(c.sideBus);
    c.sideFromR.connect(c.sideBus);
    c.sideSplitter.connect(c.midAnchorFromL, 0);
    c.sideSplitter.connect(c.midAnchorFromR, 1);
    c.midAnchorFromL.connect(c.midAnchorBus);
    c.midAnchorFromR.connect(c.midAnchorBus);
    c.sideSplitter.connect(c.lowBodyFromL, 0);
    c.sideSplitter.connect(c.lowBodyFromR, 1);
    c.lowBodyFromL.connect(c.lowBodyBus);
    c.lowBodyFromR.connect(c.lowBodyBus);
    c.sideSplitter.connect(c.upperBodyFromL, 0);
    c.sideSplitter.connect(c.upperBodyFromR, 1);
    c.upperBodyFromL.connect(c.upperBodyBus);
    c.upperBodyFromR.connect(c.upperBodyBus);
    c.sideSplitter.connect(c.vocalTickleFromL, 0);
    c.sideSplitter.connect(c.vocalTickleFromR, 1);
    c.vocalTickleFromL.connect(c.vocalTickleBus);
    c.vocalTickleFromR.connect(c.vocalTickleBus);
    c.sideBus
      .connect(c.sideHighpass)
      .connect(c.sidePresence)
      .connect(c.sideDrive)
      .connect(c.sideShaper)
      .connect(c.sideTone)
      .connect(c.sideWet);
    c.sideWet.connect(c.sideToL).connect(c.sideMerger, 0, 0);
    c.sideWet.connect(c.sideToR).connect(c.sideMerger, 0, 1);

    // Real-side MID harmonic exciter, branched from the same true (L-R) bus and
    // summed into the same antisymmetric fold (sideToL +1 / sideToR -1) -> stays
    // mono-cancelling.
    c.sideBus
      .connect(c.sideMidHighpass)
      .connect(c.sideMidLowpass)
      .connect(c.sideMidPresence)
      .connect(c.sideMidDrive)
      .connect(c.sideMidShaper)
      .connect(c.sideMidTone)
      .connect(c.sideMidWet);
    c.sideMidWet.connect(c.sideToL);
    c.sideMidWet.connect(c.sideToR);

    // Mid-center sweet anchor: +Mid/+Mid, not +Side/-Side. This makes the
    // midrange stand out in the center while the side exciter adds movement
    // around it, so Max Enhancer feels wide but not hollow/phasey.
    c.midAnchorBus
      .connect(c.midAnchorHighpass)
      .connect(c.midAnchorLowpass)
      .connect(c.midAnchorFocus)
      .connect(c.midAnchorDrive)
      .connect(c.midAnchorShaper)
      .connect(c.midAnchorTone)
      .connect(c.midAnchorWet);
    c.midAnchorWet.connect(c.midAnchorToL).connect(c.sideMerger, 0, 0);
    c.midAnchorWet.connect(c.midAnchorToR).connect(c.sideMerger, 0, 1);

    // Coherent low-mid body anchor: adds chest/body support around 200-300 Hz
    // only as equal Mid energy, with a mud guard just above it.
    c.lowBodyBus
      .connect(c.lowBodyHighpass)
      .connect(c.lowBodyLowpass)
      .connect(c.lowBodyFocus)
      .connect(c.lowBodyMudGuard)
      .connect(c.lowBodyWet);
    c.lowBodyWet.connect(c.lowBodyToL).connect(c.sideMerger, 0, 0);
    c.lowBodyWet.connect(c.lowBodyToR).connect(c.sideMerger, 0, 1);

    // Upper vocal-body anchor: +Mid/+Mid only. It fills the 300-1k body bridge
    // around 600 Hz without adding side width and without chasing resonant peaks.
    c.upperBodyBus
      .connect(c.upperBodyHighpass)
      .connect(c.upperBodyLowpass)
      .connect(c.upperBodyFocus)
      .connect(c.upperBodyHonkGuard)
      .connect(c.upperBodyDrive)
      .connect(c.upperBodyShaper)
      .connect(c.upperBodyWet);
    c.upperBodyWet.connect(c.upperBodyToL).connect(c.sideMerger, 0, 0);
    c.upperBodyWet.connect(c.upperBodyToR).connect(c.sideMerger, 0, 1);

    // Coherent 1.15 kHz vocal tickle: +Mid/+Mid only. It helps vocal texture
    // speak through bass without widening or phase-rotating the source.
    c.vocalTickleBus
      .connect(c.vocalTickleHighpass)
      .connect(c.vocalTickleLowpass)
      .connect(c.vocalTickleFocus)
      .connect(c.vocalTickleResGuard)
      .connect(c.vocalTickleDrive)
      .connect(c.vocalTickleShaper)
      .connect(c.vocalTickleWet);
    c.vocalTickleWet.connect(c.vocalTickleToL).connect(c.sideMerger, 0, 0);
    c.vocalTickleWet.connect(c.vocalTickleToR).connect(c.sideMerger, 0, 1);

    // Mid Projection Engine: centered density/presence + tiny side tuck. The
    // mid layer is added equally to L/R; the side tuck is inverted Side in the
    // same 0.7-3.1 kHz region so the center appears closer without extra volume.
    c.midAnchorBus
      .connect(c.midProjectHighpass)
      .connect(c.midProjectLowpass)
      .connect(c.midProjectFocus)
      .connect(c.midProjectNasalGuard)
      .connect(c.midProjectShoutGuard)
      .connect(c.midProjectDrive)
      .connect(c.midProjectShaper)
      .connect(c.midProjectWet);
    c.midProjectWet.connect(c.midProjectToL).connect(c.sideMerger, 0, 0);
    c.midProjectWet.connect(c.midProjectToR).connect(c.sideMerger, 0, 1);

    c.midAnchorBus
      .connect(c.midProjectBodyHighpass)
      .connect(c.midProjectBodyLowpass)
      .connect(c.midProjectBody)
      .connect(c.midProjectBodyMudGuard)
      .connect(c.midProjectBodyDrive)
      .connect(c.midProjectBodyShaper)
      .connect(c.midProjectBodyWet);
    c.midProjectBodyWet.connect(c.midProjectBodyToL).connect(c.sideMerger, 0, 0);
    c.midProjectBodyWet.connect(c.midProjectBodyToR).connect(c.sideMerger, 0, 1);

    c.sideBus
      .connect(c.sideTuckHighpass)
      .connect(c.sideTuckLowpass)
      .connect(c.sideTuckFocus)
      .connect(c.sideTuckWet);
    c.sideTuckWet.connect(c.sideTuckToL).connect(c.sideMerger, 0, 0);
    c.sideTuckWet.connect(c.sideTuckToR).connect(c.sideMerger, 0, 1);

    // Smart God Particles+: real-side air (+Side/-Side), plus coherent center
    // upper-mid/air particles (+Mid/+Mid). The center path is intentional: it
    // makes the actual musical mid sparkle, not just the stereo edge.
    c.sideBus
      .connect(c.godSideHighpass)
      .connect(c.godSideFocus)
      .connect(c.godSideDrive)
      .connect(c.godSideShaper)
      .connect(c.godSideTone)
      .connect(c.godSideWet);
    c.godSideWet.connect(c.godSideToL).connect(c.sideMerger, 0, 0);
    c.godSideWet.connect(c.godSideToR).connect(c.sideMerger, 0, 1);

    c.midAnchorBus
      .connect(c.godMidHighpass)
      .connect(c.godMidFocus)
      .connect(c.godMidDrive)
      .connect(c.godMidShaper)
      .connect(c.godMidTone)
      .connect(c.godMidWet);
    c.godMidWet.connect(c.godMidToL).connect(c.sideMerger, 0, 0);
    c.godMidWet.connect(c.godMidToR).connect(c.sideMerger, 0, 1);

    c.sideMerger.connect(c.output);

    c.output
      .connect(c.aiRepairPresence)
      .connect(c.aiRepairTickle)
      .connect(c.aiRepairDeHarsh)
      .connect(c.aiRepairEdge)
      .connect(c.aiRepairGlass)
      .connect(c.aiRepairGrain)
      .connect(c.aiRepairSplash)
      .connect(c.aiRepairChirp)
      .connect(c.aiRepairFizz)
      .connect(c.aiRepairAirShelf)
      .connect(c.aiRepairOutput);

    c.input
      .connect(c.aiSilkSource)
      .connect(c.aiSilkDrive)
      .connect(c.aiSilkShaper)
      .connect(c.aiSilkHighpass)
      .connect(c.aiSilkLowpass)
      .connect(c.aiSilkTone)
      .connect(c.aiSilkWet)
      .connect(c.aiRepairOutput);

    c.input
      .connect(c.aiEdgeSource)
      .connect(c.aiEdgeDrive)
      .connect(c.aiEdgeShaper)
      .connect(c.aiEdgeTone)
      .connect(c.aiEdgeWet)
      .connect(c.aiRepairOutput);

    c.midAnchorBus
      .connect(c.trebleSkinBand)
      .connect(c.trebleSkinDrive)
      .connect(c.trebleSkinShaper)
      .connect(c.trebleSkinTone)
      .connect(c.trebleSkinWet);
    c.trebleSkinWet.connect(c.trebleSkinToL).connect(c.sideMerger, 0, 0);
    c.trebleSkinWet.connect(c.trebleSkinToR).connect(c.sideMerger, 0, 1);

    return c.aiRepairOutput;
  }

  connectWidth(cursor) {
    const w = this.widthNodes;
    cursor.connect(w.input).connect(w.splitter);

    // Source-aware width v11: preserve the incoming L/R music as the dry path.
    // The module only adds a small, mono-cancelling side layer generated from a
    // filtered mid copy. Existing stereo drums, pianos and ambience are never
    // narrowed or rebuilt into mono by this block.
    w.splitter.connect(w.lDry, 0); w.lDry.connect(w.merger, 0, 0);
    w.splitter.connect(w.rDry, 1); w.rDry.connect(w.merger, 0, 1);

    w.splitter.connect(w.lMid, 0); w.lMid.connect(w.midBus);
    w.splitter.connect(w.rMid, 1); w.rMid.connect(w.midBus);
    const sideRoot = w.midBus.connect(w.generatedPreHighpass).connect(w.generatedPhaseA).connect(w.generatedPhaseB);

    const reconnectWidthBand = (band) => {
      // getAllNodes().disconnect() resets every AudioNode on each graph rebuild.
      // Rebuild the internal crossover chain here so multiband generated Side
      // never goes silent after start/bypass/preset/output-route changes.
      const nodes = band.nodeMap || {};
      let tail = band.entry;
      if (nodes.low) {
        tail.connect(nodes.low);
        tail = nodes.low;
      }
      if (nodes.high) {
        tail.connect(nodes.high);
        tail = nodes.high;
      }
      tail.connect(band.guard).connect(band.gain);
    };

    const bands = [w.lowBand, w.lowMidBand, w.midBand, w.highBand];
    for (const band of bands) {
      reconnectWidthBand(band);
      sideRoot.connect(band.entry);
      const out = band === w.highBand ? band.gain.connect(w.sideAirTone) : band.gain;
      out.connect(w.sideToL);
      out.connect(w.sideToR);
    }
    w.sideToL.connect(w.merger, 0, 0);
    w.sideToR.connect(w.merger, 0, 1);
    return w.merger;
  }


  applyAllParams() {
    if (!this.context) return;
    const now = this.context.currentTime;
    const ramp = 0.018;

    this.state = this.prepareState(this.state);
    this.applyPerformanceSettings();

    if (this.inputGain) this.inputGain.gain.setTargetAtTime(dbToGain(this.state.output.inputGain), now, ramp);
    if (this.smartHeadroomGain && !Number.isFinite(this.smartHeadroomGain.gain.value)) this.smartHeadroomGain.gain.value = 1;
    if (this.smartMakeupGain && !Number.isFinite(this.smartMakeupGain.gain.value)) this.smartMakeupGain.gain.value = 1;

    const normalizedBands = normalizeEqBands(this.state.eq);
    normalizedBands.forEach((band, bandIndex) => {
      const group = this.eqNodeGroups[bandIndex] || [];
      const qValues = isCutType(band.type) ? (BUTTERWORTH_Q[band.slope] || BUTTERWORTH_Q[12]) : [band.q];
      group.forEach((node, nodeIndex) => {
        node.type = band.enabled !== false ? toWebAudioType(band.type) : 'allpass';
        node.frequency.setTargetAtTime(Number(band.frequency), now, ramp);
        node.gain.setTargetAtTime(isCutType(band.type) ? 0 : Number(band.gain || 0), now, ramp);
        node.Q.setTargetAtTime(qValues[nodeIndex] || Number(band.q || 1), now, ramp);
      });
    });

    if (this.compressor) {
      const c = this.state.compressor;
      this.compressor.threshold.setTargetAtTime(c.threshold, now, ramp);
      this.compressor.ratio.setTargetAtTime(c.ratio, now, ramp);
      this.compressor.knee.setTargetAtTime(c.knee, now, ramp);
      this.compressor.attack.setTargetAtTime(c.attack, now, ramp);
      this.compressor.release.setTargetAtTime(c.release, now, ramp);
    }
    if (this.makeupGain) this.makeupGain.gain.setTargetAtTime(dbToGain(this.state.compressor.makeupGain), now, ramp);

    this.applyColorParams(now, ramp);
    this.applyWidthParams(now, ramp);

    if (this.limiterDrive) this.limiterDrive.gain.setTargetAtTime(dbToGain(this.state.output.limiterDrive), now, ramp);
    if (this.limiter) {
      this.limiter.threshold.setTargetAtTime(this.state.output.limiterCeiling, now, ramp);
      this.limiter.knee.setTargetAtTime(this.state.output.punchProtect ? 3 : 0, now, ramp);
      this.limiter.attack.setTargetAtTime(this.state.output.punchProtect ? 0.004 : 0.0015, now, ramp);
      this.limiter.release.setTargetAtTime(this.state.output.punchProtect ? 0.08 : 0.055, now, ramp);
    }
    if (this.outputGain) this.outputGain.gain.setTargetAtTime(dbToGain(this.state.output.outputGain), now, ramp);
  }

  applyColorParams(now, ramp) {
    if (!this.colorNodes?.bassDrive) return;
    const color = this.state.color;
    const c = this.colorNodes;
    const mix = clamp01((color.mix || 0) / 100);
    const bodyAmount = clamp((color.body || 0) / 24, -1, 1);
    const warmthAmount = clamp((color.warmth || 0) / 24, -1, 1);
    const airValue = color.air || 0;
    const airAmount = clamp(airValue / 48, -0.5, 1);
    const positiveAir = Math.max(0, airValue);
    const harmonicAmount = clamp01((color.harmonics || 0) / 100);
    const bodyCenter = clamp(Number(color.bodyFreq ?? 170), 95, 260);
    const warmCenter = clamp(Number(color.warmthFreq ?? 490), 300, 760);
    const harmonicCenter = clamp(Number(color.harmonicsFreq ?? 2150), 1200, 3600);
    const airCenter = clamp(Number(color.airFreq ?? 11200), 6500, 16000);
    const velvetTrebleAmt = clamp01((Number(color.velvetTreble ?? 66) || 0) / 100);
    const highRepairAmt = clamp01((Number(color.aiHighRepair ?? 48) || 0) / 100);
    // v27 Rounded Particle Air: keep generated brightness away from the fragile
    // 6–12 kHz treble-artifact zone. That zone is allowed to remain mostly
    // original; added air/particles are shifted higher, smaller, and more gloss-like.
    const turboReward = this.performanceMode === 'normal' ? 1 : 0;
    // v0.3.94 Turbo Clarity Reward: in TURBO, the velvet/repair guard must not
    // blanket the whole upper spectrum. Let ECO stay clean/reference, but let TURBO
    // keep the mid-high tickle and top-end sparkle users expect as the CPU reward.
    const roundedParticleGuard = clamp01((velvetTrebleAmt * 0.48 + highRepairAmt * 0.34) * (turboReward ? 0.72 : 1));
    const voiceSafe = color.mode === 'clean' && color.drive <= 2.2 && color.mix <= 16;
    const modeDrive = color.mode === 'mastering' ? 0.96 : color.mode === 'modern' ? 0.92 : color.mode === 'warm' ? 0.84 : 0.58;
    const driveDb = clamp(color.drive * 0.92 + color.harmonics * 0.034, 0, voiceSafe ? 5.2 : 12.2) * modeDrive;
    const turboBassReward = 1 + turboReward * 0.12;
    const turboAirReward = 1 + turboReward * 0.34;
    const turboSideReward = 1 + turboReward * 0.30;
    const presetId = this.state.selectedPresetId;
    const isSonKuHoreg = presetId === 'sonkuhoreg';
    const isSonKuBattle = presetId === 'sonkubattle';
    const isSonKuBalap = presetId === 'sonkubalap';
    const isHoregFamily = isSonKuHoreg || isSonKuBattle || isSonKuBalap;
    const horegIntent = isHoregFamily ? clamp01((Number(color.smartBass ?? 96) || 0) / 100) : 0;
    const battleIntent = isSonKuBattle ? horegIntent : (isSonKuBalap ? horegIntent * 0.72 : 0);
    const balapIntent = isSonKuBalap ? horegIntent : 0;
    const horegMidPolish = isSonKuHoreg ? 1 : (isSonKuBattle ? 1.18 : (isSonKuBalap ? 1.14 : 0));

    // Color v9: four-band analog-style parallel color.
    // 1) Low Punch keeps transient/body weight instead of lowpass-smearing the bass.
    // 2) Warm Body adds mostly even-harmonic density around chest/low-mid.
    // 3) Presence Body thickens vocal/instruments before the harsh sibilant zone.
    // 4) Silky Air adds bright polish with soft high-only nonlinearity.
    // The dry path stays strong so Color feels like premium analog lift, not a fuzz insert.
    // v0.3.94: keep TURBO dry/micro-detail at least as alive as ECO.
    // Earlier builds set this lower here, overriding connectColor() and making
    // TURBO feel softer/kempes in mid and mid-high.
    const turboDryDetailLift = turboReward ? clamp(1 + mix * 0.090, 1.0, 1.065) : 1 - mix * (voiceSafe ? 0.055 : 0.105);
    c.dry.gain.setTargetAtTime(turboDryDetailLift, now, ramp);

    // Band 1 — Low punch/body. Higher corner + lower drive keeps kick/bass attack intact.
    const horegLowShift = horegIntent * (18 + Math.max(0, bodyAmount) * 9) + battleIntent * 5 - balapIntent * 7;
    const horegTorque = horegIntent * (0.34 + harmonicAmount * 0.16) + battleIntent * 0.08 + balapIntent * 0.06;
    c.bassPre.frequency.setTargetAtTime(clamp(bodyCenter * (1.22 + Math.max(0, bodyAmount) * 0.10) - horegLowShift + balapIntent * 8, isSonKuBalap ? 102 : (isHoregFamily ? 88 : 118), 350), now, ramp);
    c.bassPre.Q.setTargetAtTime(isHoregFamily ? (isSonKuBalap ? 0.56 : 0.52) : 0.62, now, ramp);
    c.bassPostHighpass.frequency.setTargetAtTime(clamp(bodyCenter * 0.34 + Math.max(0, bodyAmount) * 8 - horegIntent * 14 + balapIntent * 18, isSonKuBalap ? 41 : (isHoregFamily ? 30 : 42), isSonKuBalap ? 104 : (isHoregFamily ? 86 : 96)), now, ramp);
    c.bassPostLowpass.frequency.setTargetAtTime(clamp(bodyCenter * 3.85 + harmonicAmount * 120 + horegIntent * 135 + balapIntent * 90, 430, isSonKuBalap ? 1220 : (isHoregFamily ? 1080 : 900)), now, ramp);
    c.bassPunch.frequency.setTargetAtTime(clamp(bodyCenter * 0.66 + Math.max(0, bodyAmount) * 36 - horegIntent * 18 + balapIntent * 32, isSonKuBalap ? 82 : (isHoregFamily ? 68 : 95), 220), now, ramp);
    c.bassPunch.Q.setTargetAtTime(isHoregFamily ? 0.62 : 0.72, now, ramp);
    c.bassPunch.gain.setTargetAtTime(((voiceSafe ? 0.25 : 1.35) + Math.max(0, color.body) * (0.145 + horegIntent * 0.020) + harmonicAmount * (0.42 + horegIntent * 0.22)) * (1 + turboReward * 0.055), now, ramp);
    c.bassDrive.gain.setTargetAtTime(dbToGain((driveDb * (voiceSafe ? 0.22 : 0.36 + horegIntent * 0.035) + Math.max(0, color.body) * (0.026 + horegIntent * 0.004)) * (1 + turboReward * 0.040)), now, ramp);
    c.bassWet.gain.setTargetAtTime(clamp(mix * (voiceSafe ? 0.060 : 0.18 + Math.max(0, bodyAmount) * (0.34 + horegTorque) + harmonicAmount * (0.08 + horegIntent * 0.045 + balapIntent * 0.035)) * turboBassReward, 0, isSonKuBalap ? 0.455 : (isHoregFamily ? 0.47 : 0.355)), now, ramp);
    c.bassShaper.curve = makeBassExciterCurve(driveDb * (voiceSafe ? 0.30 : 0.44 + horegIntent * 0.045) + Math.max(0, color.body) * (0.030 + horegIntent * 0.006), color.mode);

    // Band 2 — Warm low-mid / vocal chest. This is the "analog thickness" band.
    c.warmPre.frequency.setTargetAtTime(clamp(warmCenter - Math.max(0, warmthAmount) * 18, 330, 720), now, ramp);
    c.warmPre.Q.setTargetAtTime(0.58 + Math.max(0, warmthAmount) * 0.10, now, ramp);
    c.warmDrive.gain.setTargetAtTime(dbToGain(driveDb * (voiceSafe ? 0.22 : 0.34) + Math.max(0, color.warmth) * 0.025), now, ramp);
    c.warmTone.frequency.setTargetAtTime(clamp(warmCenter + 35 + Math.max(0, warmthAmount) * 18, 360, 760), now, ramp);
    c.warmTone.Q.setTargetAtTime(0.72, now, ramp);
    c.warmTone.gain.setTargetAtTime(color.warmth * 0.084 + harmonicAmount * (voiceSafe ? 0.08 : 0.34), now, ramp);
    c.warmWet.gain.setTargetAtTime(mix * (voiceSafe ? 0.08 : 0.18 + Math.max(0, warmthAmount) * 0.34 + harmonicAmount * 0.12) * (1 - turboReward * 0.085), now, ramp);
    c.warmShaper.curve = makeAnalogWarmCurve(driveDb * (voiceSafe ? 0.20 : 0.32) + Math.max(0, color.warmth) * 0.024, color.mode);

    // Band 3 — Presence body. Lower and broader than old Color so vocals/instruments
    // become thick and pleasant, while 5–8 kHz stays protected from harsh grit.
    const presenceBase = color.mode === 'warm' ? Math.min(harmonicCenter, 2100) : harmonicCenter;
    c.presencePre.frequency.setTargetAtTime(clamp(presenceBase + harmonicAmount * 180, 1250, 3600), now, ramp);
    c.presencePre.Q.setTargetAtTime(0.58 + harmonicAmount * 0.12, now, ramp);
    c.presenceDrive.gain.setTargetAtTime(dbToGain(driveDb * (voiceSafe ? 0.11 : 0.20) + harmonicAmount * (voiceSafe ? 0.14 : 0.36)), now, ramp);
    c.presenceTone.frequency.setTargetAtTime(clamp(harmonicCenter * 1.42 + positiveAir * 10, 2300, 4800), now, ramp);
    c.presenceTone.Q.setTargetAtTime(0.68, now, ramp);
    c.presenceTone.gain.setTargetAtTime((voiceSafe ? 0.04 : 0.42) + positiveAir * 0.012 + harmonicAmount * (voiceSafe ? 0.08 : 0.26), now, ramp);
    c.presenceWet.gain.setTargetAtTime(mix * (voiceSafe ? 0.035 : 0.090 + harmonicAmount * 0.12 + Math.max(0, warmthAmount) * 0.035) * (1 + turboReward * 0.115), now, ramp);
    c.presenceShaper.curve = makePresenceExciterCurve(driveDb * (voiceSafe ? 0.09 : 0.17) + harmonicAmount * 0.28, color.mode);

    // Band 4 — Rounded Particle Air. Bright enough to feel premium, but the
    // synthetic layer avoids 6–12 kHz where edge/glass/grain/splash artifacts
    // are most obvious. Air is rebuilt as tiny, glossy particles above that zone,
    // not as hiss.
    const airBase = airCenter;
    c.airPre.frequency.setTargetAtTime(clamp(airBase - Math.max(0, airAmount) * 40 + velvetTrebleAmt * 760 + roundedParticleGuard * 260, 10800, 16000), now, ramp);
    c.airPre.Q.setTargetAtTime(0.28 + harmonicAmount * 0.014 - velvetTrebleAmt * 0.050, now, ramp);
    c.airDcBlock.frequency.setTargetAtTime(clamp(airBase * 0.68 + velvetTrebleAmt * 760 + roundedParticleGuard * 320, 9000, 11200), now, ramp);
    const velvetAirDriveDb = (driveDb * (voiceSafe ? 0.052 : 0.108) + harmonicAmount * 0.34 + Math.max(0, airAmount) * 0.20) * (1 - velvetTrebleAmt * 0.24) * (1 - roundedParticleGuard * 0.045);
    c.airDrive.gain.setTargetAtTime(dbToGain(velvetAirDriveDb), now, ramp);
    c.airTone.frequency.setTargetAtTime(clamp(airBase + harmonicAmount * 820 + velvetTrebleAmt * 1280 + roundedParticleGuard * 520, 12400, 17800), now, ramp);
    c.airTone.Q.setTargetAtTime(0.42 - velvetTrebleAmt * 0.10, now, ramp);
    c.airTone.gain.setTargetAtTime(((voiceSafe ? 0.04 : 0.38) + positiveAir * 0.022 + harmonicAmount * (voiceSafe ? 0.078 : 0.25) + velvetTrebleAmt * 0.090) * (1 - roundedParticleGuard * 0.026), now, ramp);
    const airWetTarget = mix * Math.max(0, voiceSafe ? 0.030 + Math.max(0, airAmount) * 0.066 + velvetTrebleAmt * 0.012 : 0.106 + Math.max(0, airAmount) * 0.296 + harmonicAmount * 0.106 + velvetTrebleAmt * 0.030) * (1 - roundedParticleGuard * 0.030) * turboAirReward;
    c.airWet.gain.setTargetAtTime(airWetTarget, now, ramp);
    c.airShaper.curve = makeAirExciterCurve((driveDb * (voiceSafe ? 0.056 : 0.122) + harmonicAmount * 0.40 + Math.max(0, airAmount) * 0.25) * (1 - velvetTrebleAmt * 0.22) * (1 - roundedParticleGuard * 0.055), color.mode);

    // Side sparkle remains very subtle. Stereo width is owned by the Width module;
    // Color may add sheen, but must not be the source of phase problems.
    const sideAir = clamp01((positiveAir / 48) * 0.46 + harmonicAmount * 0.16);
    const sideMode = color.mode === 'mastering' ? 0.42 : color.mode === 'modern' ? 0.48 : color.mode === 'warm' ? 0.26 : 0.14;
    const sideWet = mix * sideMode * (voiceSafe ? 0.0040 + sideAir * 0.016 : 0.016 + sideAir * 0.158);
    c.sideHighpass.frequency.setTargetAtTime(clamp(airBase * 0.90 - Math.max(0, airAmount) * 28 + harmonicAmount * 150 + velvetTrebleAmt * 680 + roundedParticleGuard * 360, 10800, 14800), now, ramp);
    c.sidePresence.frequency.setTargetAtTime(clamp(airBase * 1.02 + harmonicAmount * 460 + velvetTrebleAmt * 760 + roundedParticleGuard * 420, 11600, 16200), now, ramp);
    c.sidePresence.gain.setTargetAtTime(((voiceSafe ? 0.022 : 0.134) + positiveAir * 0.012 + harmonicAmount * (voiceSafe ? 0.046 : 0.132) + velvetTrebleAmt * 0.034) * (1 - roundedParticleGuard * 0.030), now, ramp);
    c.sideDrive.gain.setTargetAtTime(dbToGain((driveDb * (voiceSafe ? 0.020 : 0.045) + harmonicAmount * 0.22) * (1 - roundedParticleGuard * 0.080)), now, ramp);
    c.sideTone.frequency.setTargetAtTime(clamp(airBase + harmonicAmount * 720 + velvetTrebleAmt * 980 + roundedParticleGuard * 460, 12800, 17600), now, ramp);
    c.sideTone.gain.setTargetAtTime(((voiceSafe ? 0.022 : 0.172) + positiveAir * 0.014 + harmonicAmount * (voiceSafe ? 0.046 : 0.148) + velvetTrebleAmt * 0.046) * (1 - roundedParticleGuard * 0.030), now, ramp);
    const sideWetTarget = clamp(sideWet * (1 - velvetTrebleAmt * 0.070) * (1 - roundedParticleGuard * 0.028) * turboSideReward, 0, voiceSafe ? 0.017 : 0.178);
    c.sideWet.gain.setTargetAtTime(sideWetTarget, now, ramp);
    c.sideShaper.curve = makeSideAirExciterCurve((driveDb * (voiceSafe ? 0.020 : 0.062) + harmonicAmount * 0.28 + Math.max(0, airAmount) * 0.15) * (1 - velvetTrebleAmt * 0.22) * (1 - roundedParticleGuard * 0.055), color.mode);
    this.aiHighRepairBase = { amount: clamp01((Number(color.aiHighRepair) || 0) / 100), velvet: velvetTrebleAmt, airWet: airWetTarget, sideWet: sideWetTarget, sideAir: sideWet, silkWet: 0 };

    // v25 Smart God Particles+ base. This is not more static treble. It adds
    // microscopic air dust, coherent upper-mid sparkle, and a tiny perceived
    // bass-power harmonic bias so small speakers feel stronger without sub boom.
    const godParticlesAmt = clamp01((Number(color.godParticles ?? 42) || 0) / 100);
    const godStereoMidAmt = clamp01((Number(color.stereoMid) || 0) / 100);
    const godVocalPresenceAmt = clamp01((Number(color.vocalPresence ?? 34) || 0) / 100);
    const godAirIntent = clamp01(godParticlesAmt * (0.64 + sideAir * 0.32 + Math.max(0, airAmount) * 0.20 + harmonicAmount * 0.09 + velvetTrebleAmt * 0.045) * (1 - roundedParticleGuard * 0.050));
    const godMidIntent = clamp01(godParticlesAmt * (0.50 + godStereoMidAmt * 0.38 + godVocalPresenceAmt * 0.26 + harmonicAmount * 0.19) + horegMidPolish * 0.050);
    const godBassIntent = clamp01(godParticlesAmt * clamp01((Number(color.smartBass ?? 52) || 0) / 100) * 0.72);
    const godDriveDb = ((voiceSafe ? 0.24 : 0.58) + godAirIntent * (voiceSafe ? 0.50 : 1.16) + harmonicAmount * 0.26 + horegMidPolish * 0.12) * (1 - velvetTrebleAmt * 0.24) * (1 - roundedParticleGuard * 0.070);
    if (c.godSideWet) {
      c.godSideHighpass.frequency.setTargetAtTime(clamp(airBase * 0.90 + godAirIntent * 900 + roundedParticleGuard * 420, 11000, 14200), now, ramp);
      c.godSideFocus.frequency.setTargetAtTime(clamp(airBase * 1.08 + godAirIntent * 1040 + roundedParticleGuard * 500, 12000, 16000), now, ramp);
      c.godSideFocus.Q.setTargetAtTime(0.44 + godAirIntent * 0.08 - velvetTrebleAmt * 0.060, now, ramp);
      c.godSideTone.frequency.setTargetAtTime(clamp(airBase * 1.22 + harmonicAmount * 620 + roundedParticleGuard * 500, 13200, 17800), now, ramp);
      c.godSideTone.gain.setTargetAtTime(clamp((0.06 + positiveAir * 0.0030 + godAirIntent * 0.245 + velvetTrebleAmt * 0.060) * (1 - roundedParticleGuard * 0.070), 0, 0.62), now, ramp);
      c.godSideDrive.gain.setTargetAtTime(dbToGain(godDriveDb), now, ramp);
      c.godSideShaper.curve = makeSideAirExciterCurve((0.30 + godDriveDb * 0.26 + godAirIntent * 0.34) * (1 - velvetTrebleAmt * 0.24) * (1 - roundedParticleGuard * 0.080), color.mode);

      c.godMidHighpass.frequency.setTargetAtTime(clamp(1700 + godMidIntent * 520 + godAirIntent * 180, 1600, 2600), now, ramp);
      c.godMidFocus.frequency.setTargetAtTime(clamp(2650 + godMidIntent * 960 + harmonicAmount * 180, 2200, 4600), now, ramp);
      c.godMidFocus.Q.setTargetAtTime(0.44 + godMidIntent * 0.18, now, ramp);
      c.godMidTone.frequency.setTargetAtTime(clamp(10200 + godAirIntent * 3800 + harmonicAmount * 680 + roundedParticleGuard * 620, 11000, 15800), now, ramp);
      c.godMidTone.gain.setTargetAtTime(clamp((0.09 + positiveAir * 0.0024 + godAirIntent * 0.12 + godMidIntent * 0.22 + velvetTrebleAmt * 0.046) * (1 - roundedParticleGuard * 0.070), 0, 0.62), now, ramp);
      c.godMidDrive.gain.setTargetAtTime(dbToGain(godDriveDb * (0.62 + godMidIntent * 0.22)), now, ramp);
      c.godMidShaper.curve = makePresenceExciterCurve(0.28 + godDriveDb * 0.24 + godAirIntent * 0.18 + godMidIntent * 0.46, color.mode);
    }
    this.godParticleBase = {
      sideWet: clamp(mix * godAirIntent * (voiceSafe ? 0.009 : 0.062) * (1 - velvetTrebleAmt * 0.12) * (1 - roundedParticleGuard * 0.065) * (1 + turboReward * 0.20), 0, voiceSafe ? 0.016 : 0.112),
      midWet: clamp(mix * (godMidIntent * (voiceSafe ? 0.010 : 0.037) + godAirIntent * (voiceSafe ? 0.0028 : 0.0096)) * (isHoregFamily ? 1.08 : 1) * (1 - velvetTrebleAmt * 0.080) * (1 - roundedParticleGuard * 0.050) * (1 + turboReward * 0.13), 0, voiceSafe ? 0.017 : (isHoregFamily ? 0.076 : 0.070)),
      driveDb: godDriveDb,
      shimmer: godAirIntent,
      midSparkle: godMidIntent,
      bassPower: clamp(godBassIntent * (1 + turboReward * 0.16), 0, 1),
      guard: 0
    };

    // Real-side MID harmonic exciter (~0.7-4.5 kHz). Lifts the genuine stereo
    // "tickle" without narrowing the original image (real Side, cancels in mono).
    // The amounts below are the BASE target; the live, context-aware factor in
    // updateAdaptiveColorStereo() scales them by how much real stereo detail the
    // source actually has, so mono material is left alone and rich stereo gets
    // pushed harder. Frequencies + curve are set here, gains via applySideMidGains.
    const stereoMidAmt = clamp01((Number(color.stereoMid) || 0) / 100);
    const vocalPresenceAmt = clamp01((Number(color.vocalPresence ?? 34) || 0) / 100);
    const midSideDriveDb = (voiceSafe ? 0.82 : 2.65) * stereoMidAmt + harmonicAmount * 1.16 * stereoMidAmt;
    c.sideMidHighpass.frequency.setTargetAtTime(220, now, ramp);
    c.sideMidLowpass.frequency.setTargetAtTime(clamp(harmonicCenter * 1.90 + harmonicAmount * 240, 3600, 5200), now, ramp);
    c.sideMidPresence.frequency.setTargetAtTime(clamp(harmonicCenter + harmonicAmount * 120, 1850, 3150), now, ramp);
    c.sideMidTone.frequency.setTargetAtTime(clamp(harmonicCenter * 1.55, 3000, 4300), now, ramp);
    c.sideMidShaper.curve = makePresenceExciterCurve(1.35 + midSideDriveDb, color.mode);
    this.sideMidBase = {
      presence: stereoMidAmt * (voiceSafe ? 0.92 : 2.55) * (isHoregFamily ? 1.07 : 1) * (1 + turboReward * 0.06),
      tone: stereoMidAmt * (voiceSafe ? 0.42 : 1.20) * (isHoregFamily ? 1.08 : 1) * (1 + turboReward * 0.06),
      driveDb: midSideDriveDb + horegMidPolish * 0.14,
      wet: clamp(stereoMidAmt * (voiceSafe ? 0.048 : 0.36) * (0.56 + 0.44 * mix) * (isHoregFamily ? 1.06 : 1) * (1 + turboReward * 0.07), 0, isHoregFamily ? 0.485 : 0.46)
    };

    // Mid-center sweet anchor uses the same Stereo Mid intent but returns a
    // coherent +Mid/+Mid layer. It is deliberately lower, broader and smoother
    // than the side exciter, so vocals/snare/guitar/piano stand forward without
    // the floating phasey image that happens when side is excited alone.
    const centerDriveDb = (voiceSafe ? 0.66 : 1.92) * stereoMidAmt
      + (voiceSafe ? 0.30 : 0.82) * vocalPresenceAmt
      + harmonicAmount * (voiceSafe ? 0.28 : 0.72) * stereoMidAmt
      + harmonicAmount * (voiceSafe ? 0.10 : 0.34) * vocalPresenceAmt
      + Math.max(0, warmthAmount) * 0.24 + battleIntent * 0.22;
    c.midAnchorHighpass.frequency.setTargetAtTime(clamp(warmCenter + 120 + Math.max(0, warmthAmount) * 45, 560, 860), now, ramp);
    c.midAnchorLowpass.frequency.setTargetAtTime(clamp(harmonicCenter * 1.95 + harmonicAmount * 180, 3400, 5000), now, ramp);
    c.midAnchorFocus.frequency.setTargetAtTime(clamp(
      vocalPresenceAmt > 0.08 ? (1980 + vocalPresenceAmt * 120 + harmonicAmount * 60) : (color.mode === 'warm' ? harmonicCenter * 0.88 : harmonicCenter),
      1650,
      2450
    ), now, ramp);
    c.midAnchorFocus.Q.setTargetAtTime(0.48 + harmonicAmount * 0.05 + vocalPresenceAmt * 0.04, now, ramp);
    c.midAnchorTone.frequency.setTargetAtTime(clamp(harmonicCenter * 1.42 + positiveAir * 8 + harmonicAmount * 120, 2450, 3900), now, ramp);
    c.midAnchorTone.Q.setTargetAtTime(0.56, now, ramp);
    c.midAnchorShaper.curve = makeMidAnchorCurve(0.85 + centerDriveDb, color.mode);
    this.midAnchorBase = {
      peak: (stereoMidAmt * (voiceSafe ? 0.44 : 1.55)
        + vocalPresenceAmt * (voiceSafe ? 0.26 : 0.86)
        + Math.max(0, color.warmth) * 0.010
        + harmonicAmount * (voiceSafe ? 0.07 : 0.20)) * (isHoregFamily ? 1.07 : 1),
      tone: (stereoMidAmt * (voiceSafe ? 0.08 : 0.34) + vocalPresenceAmt * (voiceSafe ? 0.030 : 0.12) + positiveAir * 0.0020) * (isHoregFamily ? 1.08 : 1),
      driveDb: centerDriveDb + horegMidPolish * 0.12,
      wet: clamp((stereoMidAmt * (voiceSafe ? 0.024 : 0.135) + vocalPresenceAmt * (voiceSafe ? 0.006 : 0.030)) * (0.58 + 0.42 * mix) * (isHoregFamily ? 1.08 : 1), 0, voiceSafe ? 0.044 : (isHoregFamily ? 0.196 : 0.178))
    };

    // v28 Mid Projection Engine. Formula: center projection intent combines the
    // user's Mid Projection control, Stereo Mid, Vocal Presence, and harmonic
    // density. It deliberately aims at 1.6-2.35 kHz, with guarded support near
    // 360-460 Hz and anti-nasal/anti-shout dynamic notches. It is a parallel
    // coherent center layer, so it feels closer rather than just louder.
    const midProjectionAmt = clamp01((Number(color.midProjection ?? 62) || 0) / 100);
    const projectionIntent = clamp01(midProjectionAmt * 0.54 + stereoMidAmt * 0.24 + vocalPresenceAmt * 0.17 + harmonicAmount * 0.05 + horegMidPolish * 0.035);
    const projectionDriveDb = (voiceSafe ? 0.36 : 1.18) * projectionIntent
      + vocalPresenceAmt * (voiceSafe ? 0.12 : 0.46)
      + harmonicAmount * (voiceSafe ? 0.12 : 0.38)
      + Math.max(0, color.warmth) * 0.015
      + horegMidPolish * 0.12;
    c.midProjectHighpass.frequency.setTargetAtTime(clamp(760 + projectionIntent * 140 + Math.max(0, warmthAmount) * 20, 720, 1040), now, ramp);
    c.midProjectLowpass.frequency.setTargetAtTime(clamp(3350 + projectionIntent * 520 - velvetTrebleAmt * 140, 3100, 4300), now, ramp);
    c.midProjectBody.frequency.setTargetAtTime(clamp(380 + Math.max(0, bodyAmount) * 32 + projectionIntent * 22, 320, 470), now, ramp);
    c.midProjectBody.Q.setTargetAtTime(0.58 + projectionIntent * 0.06, now, ramp);
    c.midProjectFocus.frequency.setTargetAtTime(clamp(1780 + vocalPresenceAmt * 260 + projectionIntent * 210 + harmonicAmount * 80, 1580, 2380), now, ramp);
    c.midProjectFocus.Q.setTargetAtTime(0.46 + projectionIntent * 0.06, now, ramp);
    c.midProjectNasalGuard.frequency.setTargetAtTime(980, now, ramp);
    c.midProjectNasalGuard.Q.setTargetAtTime(0.78, now, ramp);
    c.midProjectShoutGuard.frequency.setTargetAtTime(clamp(3420 + projectionIntent * 240, 3200, 4200), now, ramp);
    c.midProjectShoutGuard.Q.setTargetAtTime(0.72, now, ramp);
    c.midProjectShaper.curve = makeMidAnchorCurve(0.70 + projectionDriveDb, color.mode);
    if (c.midProjectBodyShaper) c.midProjectBodyShaper.curve = makeMidAnchorCurve(0.58 + projectionDriveDb * 0.72, color.mode);
    c.sideTuckHighpass.frequency.setTargetAtTime(clamp(620 + projectionIntent * 60, 560, 760), now, ramp);
    c.sideTuckLowpass.frequency.setTargetAtTime(clamp(2750 + projectionIntent * 480, 2350, 3400), now, ramp);
    c.sideTuckFocus.frequency.setTargetAtTime(clamp(1650 + projectionIntent * 460 + vocalPresenceAmt * 120, 1450, 2350), now, ramp);
    c.sideTuckFocus.Q.setTargetAtTime(0.54 + projectionIntent * 0.08, now, ramp);
    this.midProjectionBase = {
      body: projectionIntent * (voiceSafe ? 0.22 : 0.72) + Math.max(0, color.body) * (voiceSafe ? 0.0015 : 0.0040),
      focus: projectionIntent * (voiceSafe ? 0.58 : 1.72) + vocalPresenceAmt * (voiceSafe ? 0.12 : 0.38) + harmonicAmount * (voiceSafe ? 0.03 : 0.12),
      nasalTrim: projectionIntent * (voiceSafe ? 0.18 : 0.54),
      shoutTrim: projectionIntent * (voiceSafe ? 0.12 : 0.42) + velvetTrebleAmt * 0.08,
      driveDb: projectionDriveDb,
      wet: clamp(projectionIntent * (voiceSafe ? 0.010 : 0.054) * (0.60 + 0.40 * mix), 0, voiceSafe ? 0.020 : (isHoregFamily ? 0.082 : 0.072)),
      sideTuck: clamp(projectionIntent * (voiceSafe ? 0.004 : 0.030) * (0.56 + 0.44 * mix), 0, voiceSafe ? 0.008 : 0.042)
    };

    // Low-mid body anchor: fills the 200-300 Hz support under the standout mid.
    // This is intentionally centered and smart-limited so it thickens vocal/body
    // without dragging the whole mix into the 330-520 Hz mud zone.
    const lowBodyIntent = clamp01(stereoMidAmt * 0.26 + Math.max(0, color.body) * 0.007 + Math.max(0, color.warmth) * 0.006 + harmonicAmount * 0.032);
    const lowBodyDriveDb = (voiceSafe ? 0.18 : 0.48) * lowBodyIntent + Math.max(0, color.body) * 0.006 + Math.max(0, color.warmth) * 0.005;
    c.lowBodyHighpass.frequency.setTargetAtTime(clamp(bodyCenter * 0.82 + Math.max(0, bodyAmount) * 6, 118, 178), now, ramp);
    c.lowBodyLowpass.frequency.setTargetAtTime(clamp(bodyCenter * 2.12 + harmonicAmount * 18, 345, 440), now, ramp);
    c.lowBodyFocus.frequency.setTargetAtTime(clamp(bodyCenter * 1.45, 220, 300), now, ramp);
    c.lowBodyFocus.Q.setTargetAtTime(0.42, now, ramp);
    c.lowBodyMudGuard.frequency.setTargetAtTime(385, now, ramp);
    c.lowBodyMudGuard.Q.setTargetAtTime(0.62, now, ramp);
    c.lowBodyShaper.curve = makeLinearCurve();
    this.lowMidBodyBase = {
      focus: lowBodyIntent * (voiceSafe ? 0.12 : 0.46) + Math.max(0, color.body) * (voiceSafe ? 0.002 : 0.0045),
      mudTrim: lowBodyIntent * (voiceSafe ? 0.045 : 0.16),
      driveDb: lowBodyDriveDb,
      wet: clamp(lowBodyIntent * (voiceSafe ? 0.010 : 0.052) * (0.58 + 0.42 * mix), 0, voiceSafe ? 0.020 : 0.072)
    };

    // Upper vocal-body bridge: a tiny coherent 300-1k center layer. The base is
    // intentionally conservative; live tone-map logic only lifts it when vocal
    // body looks thin and pulls it back when 650-950 Hz honk/resonance appears.
    const upperBodyIntent = clamp01(stereoMidAmt * 0.18 + Math.max(0, color.warmth) * 0.0055 + Math.max(0, color.body) * 0.0035 + harmonicAmount * 0.018);
    const upperBodyDriveDb = (voiceSafe ? 0.08 : 0.26) * upperBodyIntent + Math.max(0, color.warmth) * 0.0025;
    c.upperBodyHighpass.frequency.setTargetAtTime(300, now, ramp);
    c.upperBodyLowpass.frequency.setTargetAtTime(1020, now, ramp);
    c.upperBodyFocus.frequency.setTargetAtTime(600, now, ramp);
    c.upperBodyFocus.Q.setTargetAtTime(0.54, now, ramp);
    c.upperBodyHonkGuard.frequency.setTargetAtTime(780, now, ramp);
    c.upperBodyHonkGuard.Q.setTargetAtTime(0.80, now, ramp);
    c.upperBodyShaper.curve = makeLinearCurve();
    this.upperMidBodyBase = {
      focus: upperBodyIntent * (voiceSafe ? 0.08 : 0.30) + Math.max(0, color.warmth) * (voiceSafe ? 0.0012 : 0.0028),
      honkTrim: upperBodyIntent * (voiceSafe ? 0.05 : 0.14),
      driveDb: upperBodyDriveDb,
      wet: clamp(upperBodyIntent * (voiceSafe ? 0.006 : 0.030) * (0.58 + 0.42 * mix), 0, voiceSafe ? 0.012 : 0.042)
    };

    // v22 Vocal Tickle Bridge around 1.15 kHz. This region makes vocals feel
    // tactile and close, but 1.3-1.6 kHz can become honky/nasal. Keep it tiny,
    // coherent and guarded; presets drive it via color.vocalTickle.
    const vocalTickleAmt = clamp01((Number(color.vocalTickle ?? 35) || 0) / 100);
    const vocalTickleDriveDb = (voiceSafe ? 0.55 : 1.55) * vocalTickleAmt + harmonicAmount * 0.80 * vocalTickleAmt;
    c.vocalTickleShaper.curve = makePresenceExciterCurve(1.0 + vocalTickleDriveDb, color.mode);
    this.vocalTickleBase = {
      focus: vocalTickleAmt * (voiceSafe ? 0.70 : 1.58),
      guardTrim: vocalTickleAmt * (voiceSafe ? 0.26 : 0.58),
      driveDb: vocalTickleDriveDb,
      wet: clamp(vocalTickleAmt * (voiceSafe ? 0.008 : 0.030) * (0.62 + 0.38 * mix), 0, 0.040)
    };

    // v0.3.96 Treble Clarity Skin: restore a small, coherent 8.75 kHz
    // center-stable detail layer. This is not side widening and not a harsh
    // static boost; it is a tiny +Mid/+Mid particle that compensates for
    // AI Repair / Velvet smoothing around 6-10 kHz.
    const trebleSkinIntent = clamp01(
      Math.max(0, airAmount) * 0.22
        + godParticlesAmt * 0.34
        + vocalTickleAmt * 0.18
        + vocalPresenceAmt * 0.08
        + stereoMidAmt * 0.10
        + turboReward * 0.055
    ) * (1 - roundedParticleGuard * 0.12);
    c.trebleSkinBand.frequency.setTargetAtTime(8750, now, ramp);
    c.trebleSkinBand.Q.setTargetAtTime(0.86 + trebleSkinIntent * 0.20, now, ramp);
    c.trebleSkinDrive.gain.setTargetAtTime(dbToGain((0.18 + driveDb * 0.035 + trebleSkinIntent * 0.62) * (1 - velvetTrebleAmt * 0.18)), now, ramp);
    c.trebleSkinTone.frequency.setTargetAtTime(8750, now, ramp);
    c.trebleSkinTone.Q.setTargetAtTime(0.78, now, ramp);
    c.trebleSkinTone.gain.setTargetAtTime(clamp(0.10 + trebleSkinIntent * 0.44 - roundedParticleGuard * 0.055, -0.12, 0.58), now, ramp);
    c.trebleSkinShaper.curve = makePresenceExciterCurve((0.14 + trebleSkinIntent * 0.48) * (1 - roundedParticleGuard * 0.16), color.mode);
    this.trebleSkinBase = {
      focus: trebleSkinIntent,
      tone: clamp(0.10 + trebleSkinIntent * 0.44, 0, 0.62),
      driveDb: 0.18 + trebleSkinIntent * 0.62,
      wet: clamp(trebleSkinIntent * mix * (voiceSafe ? 0.006 : 0.026) * (1 + turboReward * 0.20), 0, voiceSafe ? 0.012 : 0.044)
    };
    c.trebleSkinWet.gain.setTargetAtTime(this.trebleSkinBase.wet, now, ramp);

    this.applySideMidGains(now, ramp);

    // Loose analog-style compensation: keep Color audible, but stop high drive from
    // just becoming louder/crunchier. More body/warmth is allowed to remain felt.
    const colorComp = 1 / (1 + mix * (driveDb / 12.2) * (turboReward ? 0.135 : 0.18) + harmonicAmount * mix * (turboReward ? 0.062 : 0.09) + sideWet * 0.08 + this.sideMidBase.wet * 0.045 + this.midAnchorBase.wet * 0.055 + (this.midProjectionBase?.wet || 0) * 0.066 + (this.lowMidBodyBase?.wet || 0) * 0.050 + (this.upperMidBodyBase?.wet || 0) * 0.040 + (this.vocalTickleBase?.wet || 0) * 0.030 + (this.trebleSkinBase?.wet || 0) * 0.040 + Math.max(0, airAmount) * mix * 0.024);
    c.output.gain.setTargetAtTime(clamp(colorComp * (1 + turboReward * 0.018), voiceSafe ? 0.94 : (turboReward ? 0.90 : 0.84), 1.055), now, ramp);

    // Compatibility fields for older state snapshots and visualizer state.
    c.drive.gain.setTargetAtTime(dbToGain(driveDb), now, ramp);
    c.body.gain.setTargetAtTime(color.body * 0.075, now, ramp);
    c.warmth.gain.setTargetAtTime(color.warmth * 0.078, now, ramp);
    c.air.gain.setTargetAtTime((airValue + color.harmonics * 0.036) * 0.078, now, ramp);
    c.wet.gain.setTargetAtTime(mix, now, ramp);
    c.shaper.curve = makeSaturationCurve(driveDb, color.mode);
  }

  applyWidthParams(now, ramp) {
    if (!this.widthNodes?.lowBand) return;
    const width = normalizeWidth(this.state.width || {});
    this.state.width = width;
    const w = this.widthNodes;
    const tone = Number(width.sideTone || 0);
    const tonePositive = Math.max(0, tone);
    const masterExpand = clamp((width.width - 100) / 100, 0, 1);
    const widthMix = clamp01((width.mix ?? 100) / 100);

    w.lDry.gain.setTargetAtTime(1, now, ramp);
    w.rDry.gain.setTargetAtTime(1, now, ramp);
    w.lMid.gain.setTargetAtTime(0.5, now, ramp);
    w.rMid.gain.setTargetAtTime(0.5, now, ramp);

    // The mono-bass control now protects only the generated side layer. The
    // incoming stereo low end is left untouched, so stereo instruments are not
    // folded toward mono by the Width module.
    const generatedLowCut = width.monoBass ? Math.max(165, width.monoBassFreq) : 115;
    w.generatedPreHighpass.frequency.setTargetAtTime(generatedLowCut, now, ramp);
    w.generatedPhaseA.frequency.setTargetAtTime(760 + tonePositive * 8, now, ramp);
    w.generatedPhaseB.frequency.setTargetAtTime(5000 + tonePositive * 42, now, ramp);

    const additiveGain = (percent, weight, linked, maxValue) => {
      const bandExpand = clamp((percent - 100) / 100, 0, 1);
      return clamp((bandExpand * weight) + (masterExpand * linked), 0, maxValue);
    };
    const lowGain = (width.monoBass ? 0 : additiveGain(width.lowWidth, 0.018, 0.006, 0.018)) * widthMix;
    const lowMidGain = additiveGain(width.lowMidWidth, 0.044, 0.014, 0.046) * widthMix;
    const midGain = additiveGain(width.midWidth, 0.122, 0.044, 0.134) * widthMix;
    const toneMap = this.dopamineToneMap || createDefaultDopamineToneMap();
    const treblePhaseRisk = clamp(Number(toneMap.treblePhaseRisk ?? 0), 0, 1);
    const highGain = additiveGain(width.highWidth, 0.248, 0.104, 0.292) * widthMix * (1 - treblePhaseRisk * 0.18);

    w.lowBand.gain.gain.setTargetAtTime(lowGain, now, ramp);
    w.lowMidBand.gain.gain.setTargetAtTime(lowMidGain, now, ramp);
    w.midBand.gain.gain.setTargetAtTime(midGain, now, ramp);
    w.highBand.gain.gain.setTargetAtTime(highGain, now, ramp);

    w.lowBand.guard.threshold.setTargetAtTime(-8, now, ramp);
    w.lowMidBand.guard.threshold.setTargetAtTime(-14, now, ramp);
    w.midBand.guard.threshold.setTargetAtTime(-18 - midGain * 46, now, ramp);
    w.highBand.guard.threshold.setTargetAtTime(-20 - highGain * 50, now, ramp);
    w.midBand.guard.ratio.setTargetAtTime(1.35 + midGain * 4.5, now, ramp);
    w.highBand.guard.ratio.setTargetAtTime(1.55 + highGain * 5.4, now, ramp);

    w.lowBand.nodeMap.high.frequency.setTargetAtTime(155, now, ramp);
    w.lowMidBand.nodeMap.low.frequency.setTargetAtTime(165, now, ramp);
    w.lowMidBand.nodeMap.high.frequency.setTargetAtTime(720, now, ramp);
    w.midBand.nodeMap.low.frequency.setTargetAtTime(720, now, ramp);
    w.midBand.nodeMap.high.frequency.setTargetAtTime(4300 + tonePositive * 30, now, ramp);
    // v0.3.96: keep 5-8 kHz mostly center-stable; do not widen the
    // fragile glass/grain zone. High-side widening now starts higher, while
    // air/particles live above 10.8 kHz.
    w.highBand.nodeMap.low.frequency.setTargetAtTime(6750 + tonePositive * 72 + treblePhaseRisk * 520, now, ramp);

    w.sideAirTone.frequency.setTargetAtTime(11200 + tonePositive * 210 + treblePhaseRisk * 520, now, ramp);
    w.sideAirTone.gain.setTargetAtTime(clamp(tone * (0.27 - treblePhaseRisk * 0.055), -1.8, 5.2), now, ramp);
  }


  rampGainParam(param, target, fadeSeconds = 0.09) {
    if (!this.context || !param) return;
    const now = this.context.currentTime;
    const targetValue = Math.max(0, Number(target));
    try {
      if (typeof param.cancelAndHoldAtTime === 'function') {
        param.cancelAndHoldAtTime(now);
      } else {
        const current = Number.isFinite(param.value) ? param.value : targetValue;
        param.cancelScheduledValues(now);
        param.setValueAtTime(current, now);
      }
      param.linearRampToValueAtTime(targetValue, now + Math.max(0.012, fadeSeconds));
    } catch {
      param.value = targetValue;
    }
  }

  crossfadeEnhancePower(isBypassed) {
    if (!this.context || !this.bypassGain || !this.processedGain) return false;
    const fade = isBypassed ? 0.075 : 0.115;
    // OFF → ON gets a slightly longer enhanced fade-in so compressor/limiter
    // state and filter phase settle invisibly instead of creating a tick.
    this.rampGainParam(this.bypassGain.gain, isBypassed ? 1 : 0, isBypassed ? fade : 0.085);
    this.rampGainParam(this.processedGain.gain, isBypassed ? 0 : 1, fade);
    return true;
  }

  async rebuildGraphSafely() {
    if (!this.context || !this.state.active) { this.connectGraph(); return; }
    if (this.graphRebuildPromise) return this.graphRebuildPromise;
    this.graphRebuildPromise=(async()=>{ const bypassed=Boolean(this.state.output.bypass); this.rampGainParam(this.bypassGain?.gain,1,0.018); this.rampGainParam(this.processedGain?.gain,0,0.018); await new Promise(r=>setTimeout(r,24)); this.connectGraph({preserveCrossfade:true}); this.rampGainParam(this.bypassGain?.gain,bypassed?1:0,0.028); this.rampGainParam(this.processedGain?.gain,bypassed?0:1,0.038); })().finally(()=>{this.graphRebuildPromise=null;});
    return this.graphRebuildPromise;
  }

  async applyPreset(preset) {
    if (!preset) throw new Error('Preset not found.');
    const previousState = this.state;
    const hasLiveCrossfade = Boolean(this.context && this.bypassGain && this.processedGain);
    const wasBypassed = Boolean(previousState.output?.bypass);

    // WaveShaper curves, filter types and EQ topology are not sample-continuous.
    // Move briefly to the untouched dry route before changing the live rack.
    if (hasLiveCrossfade && !wasBypassed) {
      this.rampGainParam(this.bypassGain.gain, 1, 0.045);
      this.rampGainParam(this.processedGain.gain, 0, 0.035);
      await new Promise((resolve) => setTimeout(resolve, 56));
    }

    this.state = this.prepareState(applyPresetToState(this.state, preset));
    if (this.context) {
      const eqTopologyChanged = this.reconcileEqNodeGroups(this.state.eq);
      const graphTopologyChanged = this.requiresGraphTopologyChange(previousState, this.state, eqTopologyChanged);

      // Apply every discontinuous change while wet audio is muted. When the
      // topology differs, reconnect inside this same protected transition.
      this.applyAllParams();
      if (graphTopologyChanged) this.connectGraph({ preserveCrossfade: true });

      if (hasLiveCrossfade) {
        // applyAllParams() uses an 18 ms time constant; let filters and gain
        // stages settle before returning to the processed route.
        await new Promise((resolve) => setTimeout(resolve, 48));
        this.crossfadeEnhancePower(Boolean(this.state.output.bypass));
      }
    }
    this.state.updatedAt = Date.now();
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
    if (graphTopologyChanged) await this.rebuildGraphSafely();
    if (bypassPatch) this.crossfadeEnhancePower(Boolean(this.state.output.bypass));
    if (patch.performance && this.context && this.monitoringActive) {
      this.runAdaptiveAudioFrame({ force: true, includeStereoBands: false });
      this.startAdaptiveAudioLoop();
    }
    this.state.updatedAt = Date.now();
    notifyStateChanged(this.getPublicState());
  }

  getAnalysisFrame() {
    const meters = this.computeMeters({ force: false, includeStereoBands: getPerfConfig(this.performanceMode).stereoBandsInAnalysis });
    const spectrum = this.computeSfeqRtaSpectrum();
    return { meters, spectrum, state: this.getPublicState(meters) };
  }

  createRtaAnalyser() {
    if (!this.context) throw new Error('Audio context is not ready.');
    const analyser = this.context.createAnalyser();
    analyser.fftSize = this.rtaFftSize;
    analyser.minDecibels = -120;
    analyser.maxDecibels = 0;
    analyser.smoothingTimeConstant = 0;
    return analyser;
  }

  createMeterAnalyser() {
    const analyser = this.context.createAnalyser();
    analyser.fftSize = this.meterFftSize || chooseMeterFftSize(this.performanceMode);
    analyser.smoothingTimeConstant = this.performanceMode === 'normal' ? 0.18 : 0.24;
    return analyser;
  }

  applyPerformanceSettings({ resetBuffers = false } = {}) {
    this.performanceMode = normalizePerformanceMode(this.state.performance?.mode || DEFAULT_PERFORMANCE_MODE);
    const config = getPerfConfig(this.performanceMode);
    this.rtaFftSize = config.rtaFftSize;
    this.meterFftSize = config.meterFftSize;

    const setAnalyser = (analyser, fftSize, smoothing) => {
      if (!analyser) return;
      if (analyser.fftSize !== fftSize) analyser.fftSize = fftSize;
      if (typeof smoothing === 'number') analyser.smoothingTimeConstant = smoothing;
    };
    const analysisSmoothing = this.performanceMode === 'normal' ? 0 : 0.06;
    setAnalyser(this.inputAnalyser, config.rtaFftSize, analysisSmoothing);
    setAnalyser(this.outputAnalyser, config.rtaFftSize, analysisSmoothing);
    const meterSmoothing = this.performanceMode === 'normal' ? 0.18 : 0.24;
    for (const analyser of [this.inputLeftAnalyser, this.inputRightAnalyser, this.leftAnalyser, this.rightAnalyser]) {
      setAnalyser(analyser, config.meterFftSize, meterSmoothing);
    }

    const oversample = config.shaperOversample;
    const shapers = [
      this.softClipper,
      this.colorNodes?.bassShaper,
      this.colorNodes?.warmShaper,
      this.colorNodes?.presenceShaper,
      this.colorNodes?.airShaper,
      this.colorNodes?.sideShaper,
      this.colorNodes?.sideMidShaper,
      this.colorNodes?.midAnchorShaper,
      this.colorNodes?.lowBodyShaper,
      this.colorNodes?.upperBodyShaper,
      this.colorNodes?.vocalTickleShaper,
      this.colorNodes?.midProjectShaper,
      this.colorNodes?.midProjectBodyShaper,
      this.colorNodes?.aiSilkShaper,
      this.colorNodes?.aiEdgeShaper,
      this.colorNodes?.trebleSkinShaper,
      this.colorNodes?.godSideShaper,
      this.colorNodes?.godMidShaper,
      this.widthNodes?.shaper
    ];
    for (const shaper of shapers) {
      if (shaper && 'oversample' in shaper) shaper.oversample = oversample;
    }

    if (resetBuffers && this.context) {
      if (this.inputAnalyser) this.timeBufferIn = new Float32Array(this.inputAnalyser.fftSize);
      if (this.inputLeftAnalyser) this.timeBufferInputLeft = new Float32Array(this.inputLeftAnalyser.fftSize);
      if (this.inputRightAnalyser) this.timeBufferInputRight = new Float32Array(this.inputRightAnalyser.fftSize);
      if (this.outputAnalyser) this.timeBufferOut = new Float32Array(this.outputAnalyser.fftSize);
      if (this.leftAnalyser) this.timeBufferLeft = new Float32Array(this.leftAnalyser.fftSize);
      if (this.rightAnalyser) this.timeBufferRight = new Float32Array(this.rightAnalyser.fftSize);
      if (this.inputAnalyser) this.inputFrequencyData = new Float32Array(this.inputAnalyser.frequencyBinCount);
      if (this.outputAnalyser) this.outputFrequencyData = new Float32Array(this.outputAnalyser.frequencyBinCount);
      this.lastRtaFrame = { source: 'sfeq-rta-v93', pointCount: RTA_POINT_COUNT, input: [], output: [], updatedAt: 0 };
    }
  }



  startAdaptiveAudioLoop() {
    this.stopAdaptiveAudioLoop();
    if (!this.context || this.context.state === 'closed' || !this.monitoringActive) return;
    const config = getPerfConfig(this.performanceMode);
    if (!config.adaptiveLoopEnabled) return;

    const tick = () => {
      this.adaptiveAudioTimer = null;
      if (!this.context || this.context.state === 'closed' || !this.state.active || !this.monitoringActive) return;
      try {
        this.runAdaptiveAudioFrame({ force: true, includeStereoBands: false });
      } catch (error) {
        console.warn('Adaptive audio loop failed:', error);
      }
      if (this.context && this.context.state !== 'closed' && this.state.active && this.monitoringActive) {
        const nextConfig = getPerfConfig(this.performanceMode);
        if (nextConfig.adaptiveLoopEnabled) this.adaptiveAudioTimer = setTimeout(tick, nextConfig.adaptiveLoopMs);
      }
    };

    this.adaptiveAudioTimer = setTimeout(tick, config.adaptiveLoopMs);
  }

  stopAdaptiveAudioLoop() {
    if (this.adaptiveAudioTimer) {
      clearTimeout(this.adaptiveAudioTimer);
      this.adaptiveAudioTimer = null;
    }
  }

  computeBasicMeterFrame({ force = false } = {}) {
    if (!this.inputAnalyser || !this.outputAnalyser || !this.timeBufferIn || !this.timeBufferOut) return this.state.meters;
    const nowMs = Date.now();
    if (!force && this.lastAdaptiveFrameAt && nowMs - this.lastAdaptiveFrameAt < getPerfConfig(this.performanceMode).adaptiveMinFrameMs) return this.state.meters;

    this.inputAnalyser.getFloatTimeDomainData(this.timeBufferIn);
    if (this.inputLeftAnalyser && this.inputRightAnalyser && this.timeBufferInputLeft && this.timeBufferInputRight) {
      this.inputLeftAnalyser.getFloatTimeDomainData(this.timeBufferInputLeft);
      this.inputRightAnalyser.getFloatTimeDomainData(this.timeBufferInputRight);
    }
    this.outputAnalyser.getFloatTimeDomainData(this.timeBufferOut);
    if (this.leftAnalyser && this.rightAnalyser && this.timeBufferLeft && this.timeBufferRight) {
      this.leftAnalyser.getFloatTimeDomainData(this.timeBufferLeft);
      this.rightAnalyser.getFloatTimeDomainData(this.timeBufferRight);
    }

    const inputPeak = getPeak(this.timeBufferIn);
    const outputPeak = getPeak(this.timeBufferOut);
    const inputPeakLeft = this.timeBufferInputLeft ? getPeak(this.timeBufferInputLeft) : inputPeak;
    const inputPeakRight = this.timeBufferInputRight ? getPeak(this.timeBufferInputRight) : inputPeak;
    const outputPeakLeft = this.timeBufferLeft ? getPeak(this.timeBufferLeft) : outputPeak;
    const outputPeakRight = this.timeBufferRight ? getPeak(this.timeBufferRight) : outputPeak;
    const compressorGainReduction = this.state.compressor.enabled ? Math.max(0, Math.abs(this.compressor?.reduction || 0)) : 0;
    const limiterGainReduction = this.state.output.limiterEnabled ? Math.max(0, Math.abs(this.limiter?.reduction || 0)) : 0;
    const gainReduction = Math.max(compressorGainReduction, limiterGainReduction);
    const clipping = outputPeak >= 0.98 || limiterGainReduction > 8;
    const fallbackStereo = this.state.meters?.stereoBands || {
      low: { width: 0, correlation: 1 },
      mid: { width: 0, correlation: 1 },
      high: { width: 0, correlation: 1 }
    };

    this.state.meters = {
      inputPeak,
      outputPeak,
      inputPeakLeft,
      inputPeakRight,
      outputPeakLeft,
      outputPeakRight,
      gainReduction,
      compressorGainReduction,
      compressorGainReductionLeft: compressorGainReduction,
      compressorGainReductionRight: compressorGainReduction,
      limiterGainReduction,
      correlation: this.timeBufferLeft && this.timeBufferRight ? computeCorrelation(this.timeBufferLeft, this.timeBufferRight) : (this.state.meters?.correlation ?? 1),
      inputCorrelation: this.state.meters?.inputCorrelation ?? 1,
      inputStereoWidth: this.state.meters?.inputStereoWidth ?? 0,
      widthAdaptiveFactor: this.widthAdaptiveFactor,
      stereoBands: fallbackStereo,
      clipping,
      smartHeadroomDb: this.smartHeadroomDb,
      smartMakeupDb: this.smartMakeupDb,
      dopamineToneMap: this.dopamineToneMap,
      adaptiveRuntime: `offscreen-loop-v12-${this.performanceMode}-basic-meter`,
      performanceMode: this.performanceMode,
      adaptiveUpdatedAt: nowMs
    };
    this.lastMeterAt = nowMs;
    this.lastAdaptiveFrameAt = nowMs;
    return this.state.meters;
  }

  runAdaptiveAudioFrame({ force = false, includeStereoBands = false } = {}) {
    if (!this.inputAnalyser || !this.outputAnalyser || !this.timeBufferIn || !this.timeBufferOut) return this.state.meters;
    const nowMs = Date.now();
    if (!force && this.lastAdaptiveFrameAt && nowMs - this.lastAdaptiveFrameAt < getPerfConfig(this.performanceMode).adaptiveMinFrameMs) return this.state.meters;

    this.inputAnalyser.getFloatTimeDomainData(this.timeBufferIn);
    if (this.inputLeftAnalyser && this.inputRightAnalyser && this.timeBufferInputLeft && this.timeBufferInputRight) {
      this.inputLeftAnalyser.getFloatTimeDomainData(this.timeBufferInputLeft);
      this.inputRightAnalyser.getFloatTimeDomainData(this.timeBufferInputRight);
    }
    this.outputAnalyser.getFloatTimeDomainData(this.timeBufferOut);
    if (this.leftAnalyser && this.rightAnalyser && this.timeBufferLeft && this.timeBufferRight) {
      this.leftAnalyser.getFloatTimeDomainData(this.timeBufferLeft);
      this.rightAnalyser.getFloatTimeDomainData(this.timeBufferRight);
    }

    const inputPeak = getPeak(this.timeBufferIn);
    const outputPeak = getPeak(this.timeBufferOut);
    const inputPeakLeft = this.timeBufferInputLeft ? getPeak(this.timeBufferInputLeft) : inputPeak;
    const inputPeakRight = this.timeBufferInputRight ? getPeak(this.timeBufferInputRight) : inputPeak;
    const inputStereo = this.timeBufferInputLeft && this.timeBufferInputRight
      ? analyseStereoBand(this.timeBufferInputLeft, this.timeBufferInputRight)
      : { width: 0, correlation: 1, energy: 0, sideRatio: 0 };
    this.lastInputStereo = inputStereo;

    // Keep all smart sonic steering inside the offscreen audio engine. The Studio
    // analysis poll should only read cached state/spectrum, not be the reason
    // Smart Bass, AI High Repair, adaptive width/color, and smart headroom move.
    this.computeDopamineToneMap();
    this.updateAdaptiveWidth(inputStereo);
    this.updateAdaptiveColorStereo(inputStereo);

    const outputPeakLeft = this.timeBufferLeft ? getPeak(this.timeBufferLeft) : outputPeak;
    const outputPeakRight = this.timeBufferRight ? getPeak(this.timeBufferRight) : outputPeak;
    const compressorGainReduction = this.state.compressor.enabled ? Math.max(0, Math.abs(this.compressor?.reduction || 0)) : 0;
    const compressorGainReductionLeft = compressorGainReduction;
    const compressorGainReductionRight = compressorGainReduction;
    const limiterGainReduction = this.state.output.limiterEnabled ? Math.max(0, Math.abs(this.limiter?.reduction || 0)) : 0;
    this.updateSmartGainStaging(inputPeak, outputPeak, limiterGainReduction);

    const gainReduction = Math.max(compressorGainReduction, limiterGainReduction);
    const correlation = this.timeBufferLeft && this.timeBufferRight ? computeCorrelation(this.timeBufferLeft, this.timeBufferRight) : 1;
    const stereoBands = includeStereoBands ? this.computeStereoBandMetrics() : (this.state.meters?.stereoBands || {
      low: { width: 0, correlation: 1 },
      mid: { width: 0, correlation: 1 },
      high: { width: 0, correlation: 1 }
    });
    const clipping = outputPeak >= 0.98 || limiterGainReduction > 8;

    this.state.meters = {
      inputPeak,
      outputPeak,
      inputPeakLeft,
      inputPeakRight,
      outputPeakLeft,
      outputPeakRight,
      gainReduction,
      compressorGainReduction,
      compressorGainReductionLeft,
      compressorGainReductionRight,
      limiterGainReduction,
      correlation,
      inputCorrelation: inputStereo.correlation,
      inputStereoWidth: inputStereo.width,
      widthAdaptiveFactor: this.widthAdaptiveFactor,
      stereoBands,
      clipping,
      smartHeadroomDb: this.smartHeadroomDb,
      smartMakeupDb: this.smartMakeupDb,
      dopamineToneMap: this.dopamineToneMap,
      adaptiveRuntime: `offscreen-loop-v15-${this.performanceMode}-turbo-micro-detail`,
      performanceMode: this.performanceMode,
      adaptiveUpdatedAt: nowMs
    };
    this.lastMeterAt = nowMs;
    this.lastAdaptiveFrameAt = nowMs;
    return this.state.meters;
  }

  updateSmartGainStaging(inputPeak, outputPeak, limiterGainReduction = 0) {
    if (!this.context || !this.smartHeadroomGain || !this.smartMakeupGain) return;

    const now = this.context.currentTime;
    const ramp = 0.18;
    const inputDb = linearToDb(Math.max(inputPeak || 0, 1e-6));
    const outputDb = linearToDb(Math.max(outputPeak || 0, 1e-6));

    // Smart headroom: most browser audio arrives mastered close to 0 dBFS.
    // Trim hot input before the mastering rack so EQ boosts + color saturation
    // never clip / "shatter" on full-volume tabs. v0.3.86 keeps a
    // slightly hotter creative path so Enhance feels alive by default.
    const turboReward = this.performanceMode === 'normal';
    let targetHeadroomDb = 0;
    const headroomThresholdDb = turboReward ? -8.4 : -9.2;
    const headroomTargetDb = turboReward ? -7.1 : -8.3;
    const headroomFloorDb = turboReward ? -9.2 : -11;
    if (inputDb > headroomThresholdDb) {
      targetHeadroomDb = clamp(headroomTargetDb - inputDb, headroomFloorDb, 0);
    }

    // Smart restore: return most of the reserved headroom after the creative
    // chain, but automatically back off if limiter GR/output peak says the rack
    // is already too hot. This keeps output strong without crushing transients.
    const reservedDb = -targetHeadroomDb;
    const limiterPenalty = Math.max(0, limiterGainReduction - 1.5) * 0.75;
    const peakPenalty = Math.max(0, outputDb + 1.1) * 0.95;
    const relaxGuard = clamp(this.dopamineToneMap?.musicalRelaxGuard ?? 0, 0, 1);
    const targetMakeupDb = clamp(reservedDb * (turboReward ? 0.98 : 0.80) - limiterPenalty * (turboReward ? 0.72 : 1.02) - peakPenalty * (turboReward ? 0.76 : 1.08) - relaxGuard * (turboReward ? 0.06 : 0.28) + (turboReward ? 0.46 : 0), 0, turboReward ? 8.2 : 6.4);

    // UI values are smoothed separately so they do not jump while the AudioParam
    // target interpolation is settling.
    const visualAlpha = 0.08;
    this.smartHeadroomDb += (targetHeadroomDb - this.smartHeadroomDb) * visualAlpha;
    this.smartMakeupDb += (targetMakeupDb - this.smartMakeupDb) * visualAlpha;

    const safeHeadroomGain = dbToGain(this.smartHeadroomDb);
    const safeMakeupGain = dbToGain(this.smartMakeupDb);
    this.smartHeadroomGain.gain.setTargetAtTime(safeHeadroomGain, now, ramp);
    this.smartMakeupGain.gain.setTargetAtTime(safeMakeupGain, now, ramp);
  }

  computeSfeqRtaSpectrum() {
    if (!this.context || !this.inputAnalyser || !this.outputAnalyser || !this.inputFrequencyData || !this.outputFrequencyData) return this.lastRtaFrame;
    const nowMs = Date.now();
    if (this.lastRtaFrame?.updatedAt && nowMs - this.lastRtaFrame.updatedAt < getPerfConfig(this.performanceMode).rtaMinFrameMs) return this.lastRtaFrame;
    this.inputAnalyser.getFloatFrequencyData(this.inputFrequencyData);
    this.outputAnalyser.getFloatFrequencyData(this.outputFrequencyData);
    const common = { pointCount: RTA_POINT_COUNT, octaveWidth: RTA_OCTAVE_WIDTH };
    this.lastRtaFrame = {
      source: 'sfeq-rta-v93',
      pointCount: RTA_POINT_COUNT,
      octaveWidth: RTA_OCTAVE_WIDTH,
      fftSize: this.inputAnalyser.fftSize,
      sampleRate: this.context.sampleRate,
      input: buildSfeqRtaSpectrumFromFft(this.inputFrequencyData, this.context.sampleRate, this.inputAnalyser.fftSize, common),
      output: buildSfeqRtaSpectrumFromFft(this.outputFrequencyData, this.context.sampleRate, this.outputAnalyser.fftSize, common),
      updatedAt: nowMs
    };
    return this.lastRtaFrame;
  }

  updateAdaptiveWidth(inputStereo) {
    if (!this.context || !this.widthNodes?.sideToL || !this.widthNodes?.sideToR) return;
    const width = normalizeWidth(this.state.width || {});
    const now = this.context.currentTime;
    const ramp = 0.32;

    let target = 0;
    if (width.enabled && width.width > 100) {
      const correlation = clamp(Number(inputStereo?.correlation ?? 1), -1, 1);
      const sourceWidth = clamp(Number(inputStereo?.width ?? 0), 0, 220);
      const energy = Number(inputStereo?.energy ?? 0);
      const protect = clamp((width.sourceProtect ?? 86) / 100, 0, 1);
      const toneMap = this.dopamineToneMap || createDefaultDopamineToneMap();
      const treblePhaseRisk = clamp(Number(toneMap.treblePhaseRisk ?? 0), 0, 1);
      const macro = clamp((width.width - 100) / 100, 0, 1) * clamp01((width.mix ?? 100) / 100);

      if (Number.isFinite(energy) && energy >= 0.0025) {
        const monoLike = clamp((correlation - 0.68) / 0.28, 0, 1) * clamp((78 - sourceWidth) / 78, 0, 1);
        const safeStereo = clamp((correlation - 0.24) / 0.54, 0, 1) * clamp((145 - sourceWidth) / 145, 0, 1);
        const tooWide = Math.max(clamp((0.08 - correlation) / 0.46, 0, 1), clamp((sourceWidth - 195) / 64, 0, 1));
        const alreadyWideMusical = clamp((sourceWidth - 78) / 92, 0, 1) * clamp((correlation + 0.16) / 0.70, 0, 1);
        target = clamp((0.12 + monoLike * 0.90 + safeStereo * 0.34 + alreadyWideMusical * 0.25) * (0.44 + macro * 0.80), 0, 1);
        target *= (1 - tooWide * protect * 0.30);
        target *= (1 - treblePhaseRisk * (0.16 + protect * 0.24));
        // v0.3.74 Open Dopamine Stereo: if the original tab is already musically wide,
        // keep a small source-preserving side lift instead of collapsing enhancement
        // back to center. Extreme/anti-phase material is still protected.
        target = Math.max(target, alreadyWideMusical * macro * (0.48 + (1 - protect) * 0.38));
        if (correlation < -0.18 || sourceWidth > 225) target = 0;
      }
    }

    this.widthAdaptiveFactor += (target - this.widthAdaptiveFactor) * 0.22;
    if (Math.abs(this.widthAdaptiveFactor) < 0.001) this.widthAdaptiveFactor = 0;
    const highRepairDucking = 1 - clamp(this.aiHighRepairMeter || 0, 0, 1) * 0.003;
    this.widthNodes.sideToL.gain.setTargetAtTime(this.widthAdaptiveFactor * highRepairDucking, now, ramp);
    this.widthNodes.sideToR.gain.setTargetAtTime(-this.widthAdaptiveFactor * highRepairDucking, now, ramp);
  }

  applySideMidGains(now, ramp) {
    const c = this.colorNodes;
    if (!c?.sideMidWet) return;
    const f = clamp(this.colorStereoAdaptive, 0, 1.7);
    const b = this.sideMidBase || { presence: 0, tone: 0, driveDb: 0, wet: 0 };
    const turboReward = this.performanceMode === 'normal' ? 1 : 0;
    const toneMap = this.dopamineToneMap || createDefaultDopamineToneMap();
    const sideExcite = clamp(toneMap.sideExcite ?? 1, 0.78, 1.36);
    const anchorExcite = clamp(toneMap.anchorExcite ?? 1, 0.86, 1.34);
    const lowMidGlue = clamp(toneMap.lowMidGlue ?? 1, 0.88, 1.22);
    const lowBodyBoost = clamp(toneMap.lowBodyBoost ?? 1, 0.88, 1.28);
    const vocalBodyGuard = clamp(toneMap.vocalBodyGuard ?? 1, 0.88, 1.24);
    const vocalBodyEqHz = clamp(toneMap.vocalBodyEqHz ?? 490, 455, 525);
    const mudGuard = clamp(toneMap.mudGuard ?? 0, 0, 1);
    const midlowSpaceGuard = clamp(Math.max(toneMap.midlowSpaceGuard ?? 0, toneMap.bassMask ?? 0, mudGuard * 0.55), 0, 1);
    const warmBodyAuto = clamp(toneMap.warmBodyAuto ?? 0, 0, 1);
    const harshGuard = clamp(toneMap.harshGuard ?? 0, 0, 1);
    const resonanceGuard = clamp(toneMap.resonanceGuard ?? 0, 0, 1);
    const midDetailNeed = clamp(toneMap.midDetailNeed ?? 0, 0, 1);
    const midDetailWindow = clamp(toneMap.midDetailWindow ?? 0.65, 0, 1);
    const midDetailBoost = clamp(toneMap.midDetailBoost ?? 1, 0.86, 1.16);
    const midDetailGuard = clamp(toneMap.midDetailGuard ?? 0, 0, 1);
    const midCreamBoost = clamp(toneMap.midCreamBoost ?? 1, 0.88, 1.14);
    const midFormantGuard = clamp(toneMap.midFormantGuard ?? 0, 0, 1);
    const midIntelligibilityBoost = clamp(toneMap.midIntelligibilityBoost ?? 1, 0.86, 1.15);
    const midIntelligibilityGuard = clamp(toneMap.midIntelligibilityGuard ?? 0, 0, 1);
    const midPaperGuard = clamp(toneMap.midPaperGuard ?? 0, 0, 1);
    const centerDetailLift = clamp(toneMap.centerDetailLift ?? 0, 0, 1);
    const musicalRelaxGuard = clamp(toneMap.musicalRelaxGuard ?? Math.max(resonanceGuard * 0.48, harshGuard * 0.36, midDetailGuard * 0.22), 0, 1);
    const inputWideNatural = clamp(((this.lastInputStereo?.width ?? 0) - 96) / 82, 0, 1) * clamp(((this.lastInputStereo?.correlation ?? 1) + 0.10) / 0.62, 0, 1);
    const safeSide = sideExcite * (1 - harshGuard * 0.16) * (1 - resonanceGuard * 0.22) * (1 - midPaperGuard * 0.11) * (1 - musicalRelaxGuard * 0.045) * (1 + inputWideNatural * 0.22);

    // Color v15 vocal-body guard: preserve a broad, sweet 490 Hz center/body
    // support so vocal/instrument body is not buried when bass and treble are
    // enhanced. This does not create stereo width; it only steers the existing
    // warm parallel body path and is held back by mud/resonance guards.
    if (c.warmPre && c.warmTone && c.warmWet) {
      const color = this.state.color || {};
      const mix = clamp01((color.mix || 0) / 100);
      const harmonicAmount = clamp01((color.harmonics || 0) / 100);
      const warmthAmount = clamp((color.warmth || 0) / 24, -1, 1);
      const voiceSafe = color.mode === 'clean' && color.drive <= 2.2 && color.mix <= 16;
      const warmSafe = vocalBodyGuard * midCreamBoost * (1 - mudGuard * 0.16) * (1 - midlowSpaceGuard * 0.12) * (1 - midFormantGuard * 0.06) * (1 - resonanceGuard * 0.18) * (1 + warmBodyAuto * 0.055);
      const warmToneBase = color.warmth * 0.084 + harmonicAmount * (voiceSafe ? 0.08 : 0.34);
      const warmWetBase = mix * (voiceSafe ? 0.08 : 0.18 + Math.max(0, warmthAmount) * 0.34 + harmonicAmount * 0.12);
      c.warmPre.frequency.setTargetAtTime(vocalBodyEqHz, now, ramp * 1.8);
      c.warmPre.Q.setTargetAtTime(0.62 + Math.max(0, warmthAmount) * 0.06, now, ramp);
      c.warmTone.frequency.setTargetAtTime(clamp(vocalBodyEqHz + 28, 480, 555), now, ramp * 1.8);
      c.warmTone.Q.setTargetAtTime(0.72, now, ramp);
      c.warmTone.gain.setTargetAtTime(warmToneBase * clamp(warmSafe, 0.84, 1.18), now, ramp);
      c.warmWet.gain.setTargetAtTime(clamp(warmWetBase * clamp(0.92 + (vocalBodyGuard - 1) * 0.75 + warmBodyAuto * 0.060 - mudGuard * 0.10 - midlowSpaceGuard * 0.090, 0.78, 1.14), 0, voiceSafe ? 0.12 : 0.35), now, ramp);
    }


    // v0.3.74 Smart Musical Low-End Engine. Keep ArSonKuPik's glerrr/torque character,
    // but make it breathe: sub pressure is governed, 55-95 Hz torque is preserved,
    // 95-160 Hz punch opens on transients, and 180-520 Hz body/midlow is trimmed
    // dynamically when it masks vocal/mid projection. This is dynamic musical
    // steering, not a static bass cut.
    if (c.bassWet && c.bassPunch && c.bassDrive) {
      const color = this.state.color || {};
      const mix = clamp01((color.mix || 0) / 100);
      const bodyAmount = clamp((color.body || 0) / 24, -1, 1);
      const bodyCenter = clamp(Number(color.bodyFreq ?? 170), 95, 260);
      const harmonicAmount = clamp01((color.harmonics || 0) / 100);
      const voiceSafe = color.mode === 'clean' && color.drive <= 2.2 && color.mix <= 16;
      const modeDrive = color.mode === 'mastering' ? 0.96 : color.mode === 'modern' ? 0.92 : color.mode === 'warm' ? 0.84 : 0.58;
      const driveDb = clamp(color.drive * 0.92 + color.harmonics * 0.034, 0, voiceSafe ? 5.2 : 12.2) * modeDrive;
      const smartBass = clamp01((Number(color.smartBass ?? 62) || 0) / 100);
      const presetId = this.state.selectedPresetId;
      const isSonKuHoreg = presetId === 'sonkuhoreg';
      const isSonKuBattle = presetId === 'sonkubattle';
      const isSonKuBalap = presetId === 'sonkubalap';
      const isHoregFamily = isSonKuHoreg || isSonKuBattle || isSonKuBalap;
      const horegIntent = isHoregFamily ? smartBass : 0;
      const battleIntent = isSonKuBattle ? smartBass : (isSonKuBalap ? smartBass * 0.72 : 0);
      const balapIntent = isSonKuBalap ? smartBass : 0;
      const subPressure = clamp(toneMap.subPressure ?? 0, 0, 1);
      const bassSustain = clamp(toneMap.bassSustainGuard ?? 0, 0, 1);
      const bassFatigue = clamp(toneMap.bassFatigueGuard ?? 0, 0, 1);
      const bassWarmthGuard = clamp(toneMap.bassWarmthGuard ?? 0, 0, 1);
      const bassTransient = clamp(toneMap.bassTransient ?? 0, 0, 1);
      const bassMotion = clamp(toneMap.bassMotion ?? bassTransient, 0, 1);
      const bassBreathing = clamp(toneMap.bassBreathing ?? (1 - bassFatigue * 0.55 - subPressure * 0.30 + bassTransient * 0.25), 0, 1);
      const subGovernor = clamp(toneMap.subGovernor ?? subPressure, 0, 1);
      const glerrrTorque = clamp(toneMap.glerrrTorque ?? toneMap.bassTorqueKeeper ?? 0, 0, 1);
      const punchBreather = clamp(toneMap.punchBreather ?? bassTransient, 0, 1);
      const warmBodyAuto = clamp(toneMap.warmBodyAuto ?? 0, 0, 1);
      const midlowSpaceGuard = clamp(Math.max(toneMap.midlowSpaceGuard ?? 0, toneMap.bassMask ?? 0, mudGuard * 0.55), 0, 1);
      const psychoBassRelief = clamp(toneMap.psychoBassRelief ?? Math.max(subGovernor * 0.54, bassFatigue * 0.42, midlowSpaceGuard * 0.32), 0, 1);
      const lowEndPocket = clamp(toneMap.lowEndPocket ?? 1, 0.84, 1.16);
      const subBassSmile = clamp(toneMap.subBassSmile ?? 0, 0, 1);
      const bassGrooveLift = clamp(toneMap.bassGrooveLift ?? bassMotion, 0, 1);
      const bassDensityGuard = clamp(toneMap.bassDensityGuard ?? bassFatigue, 0, 1);
      const midlowUnmask = clamp(toneMap.midlowUnmask ?? midlowSpaceGuard, 0, 1);
      const vocalPocketOpen = clamp(toneMap.vocalPocketOpen ?? Math.max(midlowUnmask * 0.70, toneMap.midProjectionGuard ?? 0), 0, 1);
      const lowEndAirSpace = clamp(toneMap.lowEndAirSpace ?? 1, 0.82, 1.08);
      const bassTorqueHz = clamp(toneMap.bassTorqueHz ?? (isHoregFamily ? 74 : 92), 55, 116);
      const limiterStress = clamp((Math.max(0, Math.abs(this.limiter?.reduction || 0)) - 2.5) / 5.5, 0, 1);
      const musicalBassRelax = clamp(musicalRelaxGuard * (isHoregFamily ? 0.42 : 0.70), 0, 1);
      const turboDeepTorque = turboReward * smartBass * clamp(0.035 + glerrrTorque * 0.050 + bassMotion * 0.018 - subGovernor * 0.030 - vocalPocketOpen * 0.026, 0, 0.095);
      const turboTopBassRelief = turboReward * smartBass * clamp(midlowUnmask * 0.042 + vocalPocketOpen * 0.034, 0, 0.070);

      const basePre = clamp(bodyCenter * (1.22 + Math.max(0, bodyAmount) * 0.10), 118, 350);
      const baseHpf = clamp(bodyCenter * 0.34 + Math.max(0, bodyAmount) * 8, 42, 96);
      const baseLpf = clamp(bodyCenter * 3.85 + harmonicAmount * 120, 430, 900);
      const basePunchHz = clamp(bodyCenter * 0.66 + Math.max(0, bodyAmount) * 36, 95, 210);
      const basePunchGain = (voiceSafe ? 0.25 : 1.35) + Math.max(0, color.body || 0) * 0.145 + harmonicAmount * 0.42;
      const baseDriveDb = driveDb * (voiceSafe ? 0.22 : 0.36) + Math.max(0, color.body || 0) * 0.026;
      const baseWet = mix * (voiceSafe ? 0.060 : 0.18 + Math.max(0, bodyAmount) * 0.34 + harmonicAmount * 0.08);

      const sustainTrimScale = isSonKuBalap ? 0.74 : (isSonKuBattle ? 0.62 : (isSonKuHoreg ? 0.56 : 1.08));
      const fatigueTrim = smartBass * ((bassFatigue * 0.17 + bassSustain * 0.11 + subGovernor * 0.115 + psychoBassRelief * 0.055 + bassDensityGuard * 0.085 + vocalPocketOpen * 0.078) * sustainTrimScale + subPressure * (isSonKuBalap ? 0.105 : (isHoregFamily ? 0.085 : 0.115)) + limiterStress * (isSonKuBalap ? 0.20 : (isSonKuBattle ? 0.18 : 0.16)));
      const warmthTrim = smartBass * (bassWarmthGuard * (isSonKuBalap ? 0.105 : (isHoregFamily ? 0.084 : 0.112)) + midlowUnmask * (isSonKuBalap ? 0.150 : (isHoregFamily ? 0.132 : 0.165)) + vocalPocketOpen * (isHoregFamily ? 0.115 : 0.150) + mudGuard * 0.068 + resonanceGuard * 0.052);
      const torqueLift = smartBass * glerrrTorque * (0.056 + horegIntent * 0.096 + battleIntent * 0.046 + balapIntent * 0.042) * (1 - subGovernor * 0.34) * (1 - vocalPocketOpen * (isHoregFamily ? 0.19 : 0.27)) * (0.72 + bassBreathing * 0.28) * lowEndPocket;
      const punchLift = smartBass * (punchBreather * (isHoregFamily ? 0.19 : 0.14) + bassGrooveLift * (isSonKuBalap ? 0.090 : 0.060) - bassFatigue * (isSonKuBalap ? 0.045 : (isHoregFamily ? 0.035 : 0.060)) - limiterStress * (isSonKuBalap ? 0.055 : 0.040));
      const wetFactor = clamp((1 - fatigueTrim - warmthTrim - musicalBassRelax * smartBass * 0.034 - psychoBassRelief * smartBass * 0.028 - vocalPocketOpen * smartBass * (isHoregFamily ? 0.072 : 0.100) + bassGrooveLift * smartBass * (0.030 + battleIntent * 0.020 + balapIntent * 0.028) + subBassSmile * smartBass * 0.020 + torqueLift + turboDeepTorque + battleIntent * 0.020 + balapIntent * (0.014 + punchBreather * 0.026)) * lowEndPocket * lowEndAirSpace, 0.58, isSonKuBalap ? 1.16 : (isSonKuBattle ? 1.20 : (isSonKuHoreg ? 1.22 : 1.10)));
      const punchFactor = clamp(1 + punchLift - bassWarmthGuard * smartBass * 0.046 - subGovernor * smartBass * 0.022 - vocalPocketOpen * smartBass * (isHoregFamily ? 0.082 : 0.108) + torqueLift * 0.26 + turboDeepTorque * 0.38 + battleIntent * (punchBreather * 0.060 + 0.010) + balapIntent * (0.020 + punchBreather * 0.078), 0.78, isSonKuBalap ? 1.22 : (isSonKuBattle ? 1.20 : (isSonKuHoreg ? 1.17 : 1.12)));
      const driveFactor = clamp(1 - smartBass * (musicalBassRelax * 0.045 + bassFatigue * (isHoregFamily ? 0.058 : 0.092) + limiterStress * (isSonKuBalap ? 0.14 : (isSonKuBattle ? 0.12 : 0.10)) + subGovernor * (isSonKuBalap ? 0.095 : (isHoregFamily ? 0.075 : 0.105)) + psychoBassRelief * 0.045) + torqueLift * 0.10 + battleIntent * 0.014 + balapIntent * 0.008, 0.80, isSonKuBalap ? 1.06 : (isSonKuBattle ? 1.08 : (isSonKuHoreg ? 1.07 : 1.035)));
      const gpBass = this.godParticleBase || { bassPower: 0, shimmer: 0 };
      const bassMaskForPerception = clamp(toneMap.bassMask ?? 0, 0, 1);
      const perceivedBass = clamp((gpBass.bassPower || 0) * (toneMap.godParticleBass ?? 0) * (0.52 + punchBreather * 0.38 + glerrrTorque * 0.26 + bassMaskForPerception * 0.12 + horegIntent * 0.16 + battleIntent * 0.10 + balapIntent * 0.18) * (1 - bassFatigue * (isHoregFamily ? 0.24 : 0.46) - subGovernor * (isSonKuBalap ? 0.28 : (isHoregFamily ? 0.22 : 0.32)) - midlowSpaceGuard * 0.14), 0, 1);

      const bassPreHz = clamp(basePre - bassSustain * smartBass * (isSonKuBalap ? 7 : (isHoregFamily ? 14 : 8)) - midlowUnmask * smartBass * (isHoregFamily ? 26 : 24) + punchBreather * smartBass * 10 + bassGrooveLift * smartBass * 5 + perceivedBass * (isSonKuBalap ? 28 : (isSonKuBattle ? 22 : (isSonKuHoreg ? 16 : 9))) + balapIntent * 8, isSonKuBalap ? 98 : (isHoregFamily ? 86 : 112), 340);
      const bassHpfHz = clamp(baseHpf + subGovernor * smartBass * (isSonKuBalap ? 18 : (isHoregFamily ? 10 : 15)) + psychoBassRelief * smartBass * 3.4 + limiterStress * smartBass * (isSonKuBalap ? 10 : 6.5) - glerrrTorque * horegIntent * 8 - subBassSmile * smartBass * (4 + turboReward * 2.2) - turboDeepTorque * 42 + balapIntent * 16, isSonKuBalap ? 40 : (isHoregFamily ? 29 : 38), isSonKuBalap ? 112 : (isHoregFamily ? 96 : 108));
      const bassLpfHz = clamp(baseLpf - bassFatigue * smartBass * (isSonKuBalap ? 50 : (isHoregFamily ? 44 : 78)) - bassWarmthGuard * smartBass * (isSonKuBalap ? 44 : (isHoregFamily ? 39 : 56)) - midlowUnmask * smartBass * (isSonKuBalap ? 155 : (isHoregFamily ? 165 : 185)) - vocalPocketOpen * smartBass * (isSonKuBalap ? 104 : (isHoregFamily ? 94 : 132)) + punchBreather * smartBass * 18 + warmBodyAuto * smartBass * 28 + perceivedBass * (isSonKuBalap ? 78 : (isSonKuBattle ? 58 : (isSonKuHoreg ? 52 : 24))) + glerrrTorque * horegIntent * 24 + balapIntent * 36, 360, isSonKuBalap ? 900 : (isHoregFamily ? 820 : 760));
      const musicalPunchHz = clamp((toneMap.bassPunchHz ?? basePunchHz) * (0.94 + punchBreather * 0.06) + (bassTorqueHz - 82) * (isHoregFamily ? 0.24 : 0.10) + perceivedBass * (isSonKuBalap ? 14 : (isHoregFamily ? 8 : 14)) - subGovernor * 6 - vocalPocketOpen * 15 - horegIntent * 8 + balapIntent * 18, isSonKuBalap ? 76 : (isHoregFamily ? 62 : 86), 196);

      c.bassPre.frequency.setTargetAtTime(bassPreHz, now, ramp * 1.9);
      c.bassPostHighpass.frequency.setTargetAtTime(bassHpfHz, now, ramp * 1.9);
      c.bassPostLowpass.frequency.setTargetAtTime(bassLpfHz, now, ramp * 1.9);
      c.bassPunch.frequency.setTargetAtTime(musicalPunchHz, now, ramp * 1.9);
      c.bassPunch.gain.setTargetAtTime(clamp(basePunchGain * punchFactor + warmBodyAuto * smartBass * 0.18 + bassGrooveLift * smartBass * 0.22 - bassWarmthGuard * smartBass * (isSonKuBalap ? 0.36 : 0.28) - midlowUnmask * smartBass * 0.56 - vocalPocketOpen * smartBass * 0.50 + perceivedBass * (isSonKuBalap ? 0.86 : (isSonKuBattle ? 0.74 : (isSonKuHoreg ? 0.70 : 0.38))), 0.12, isSonKuBalap ? 5.2 : (isHoregFamily ? 5.35 : 4.75)), now, ramp);
      c.bassDrive.gain.setTargetAtTime(dbToGain(baseDriveDb * driveFactor * (1 + perceivedBass * (isSonKuBalap ? 0.040 : (isSonKuBattle ? 0.058 : (isSonKuHoreg ? 0.052 : 0.018))))), now, ramp);
      c.bassWet.gain.setTargetAtTime(clamp(baseWet * wetFactor * (1 + perceivedBass * (isSonKuBalap ? 0.048 : (isSonKuBattle ? 0.060 : (isSonKuHoreg ? 0.056 : 0.018))) + turboDeepTorque * 0.42) * (1 - midlowUnmask * smartBass * 0.092 - vocalPocketOpen * smartBass * 0.086 - turboTopBassRelief), 0, voiceSafe ? 0.095 : (isSonKuBalap ? 0.392 : (isSonKuBattle ? 0.415 : (isSonKuHoreg ? 0.435 : 0.305)))), now, ramp);
    }

    c.sideMidPresence.frequency.setTargetAtTime(clamp(toneMap.sideFocusHz ?? 2380, 1850, 3150), now, ramp * 1.7);
    c.sideMidTone.frequency.setTargetAtTime(clamp(toneMap.tickleToneHz ?? 3600, 2850, 4550), now, ramp * 1.7);
    c.sideMidPresence.gain.setTargetAtTime(b.presence * f * safeSide * (0.96 + midDetailWindow * 0.06) * (1 + turboReward * 0.075), now, ramp);
    c.sideMidTone.gain.setTargetAtTime(b.tone * f * safeSide * (1 - harshGuard * 0.13) * (1 - midPaperGuard * 0.14) * (1 + turboReward * 0.090), now, ramp);
    c.sideMidDrive.gain.setTargetAtTime(dbToGain(b.driveDb * (0.58 + 0.42 * f) * (0.96 + safeSide * 0.04) * (1 + turboReward * 0.035)), now, ramp);
    c.sideMidWet.gain.setTargetAtTime(clamp(b.wet * f * safeSide * (1 - musicalRelaxGuard * 0.055) * (1 + turboReward * 0.20), 0, 0.43), now, ramp);

    // Keep a coherent center anchor under the side movement. It follows the same
    // smart factor but is never anti-phase; it is equal energy in L/R. The smart
    // tone map gently finds vocal/presence sweet spots and adds a little low-mid
    // glue only when the source feels thin.
    if (c.midAnchorWet) {
      const a = this.midAnchorBase || { peak: 0, tone: 0, driveDb: 0, wet: 0 };
      const vocalPresenceBoost = clamp((toneMap.vocalPresenceBoost ?? 1) * midDetailBoost * midIntelligibilityBoost, 0.82, 1.28);
      const vocalPresenceGuard = clamp(Math.max(toneMap.vocalPresenceGuard ?? 0, midIntelligibilityGuard * 0.72, midPaperGuard * 0.42), 0, 1);
      const anchorFactor = clamp(0.48 + f * 0.42, 0, 1.05)
        * anchorExcite
        * vocalPresenceBoost
        * (1 - vocalPresenceGuard * 0.32)
        * (1 - midDetailGuard * 0.16)
        * (0.96 + midDetailWindow * 0.08 + centerDetailLift * 0.04)
        * (1 - resonanceGuard * 0.26)
        * (1 - musicalRelaxGuard * 0.08);
      c.midAnchorHighpass.frequency.setTargetAtTime(clamp(toneMap.anchorLowHz ?? 620, 520, 820), now, ramp * 1.8);
      c.midAnchorFocus.frequency.setTargetAtTime(clamp((toneMap.vocalPresenceHz ?? toneMap.anchorFocusHz ?? 2050) + centerDetailLift * 70 - midIntelligibilityGuard * 60, 1700, 2380), now, ramp * 1.8);
      c.midAnchorTone.frequency.setTargetAtTime(clamp(toneMap.midIntelligibilityHz ?? toneMap.anchorToneHz ?? 2850, 2380, 3450), now, ramp * 1.8);
      c.midAnchorFocus.Q.setTargetAtTime(0.46 + vocalPresenceGuard * 0.11 + resonanceGuard * 0.05, now, ramp);
      c.midAnchorFocus.gain.setTargetAtTime(a.peak * anchorFactor * lowMidGlue, now, ramp);
      c.midAnchorTone.gain.setTargetAtTime(a.tone * anchorFactor * (1 - harshGuard * 0.10) * (1 - midPaperGuard * 0.22) + centerDetailLift * 0.10, now, ramp);
      c.midAnchorDrive.gain.setTargetAtTime(dbToGain(a.driveDb * (0.70 + anchorFactor * 0.28) * (1 - midDetailGuard * 0.10)), now, ramp);
      c.midAnchorWet.gain.setTargetAtTime(clamp(a.wet * anchorFactor * lowMidGlue * (0.98 + midDetailWindow * 0.06), 0, 0.18), now, ramp);
    }

    if (c.midProjectWet) {
      const mp = this.midProjectionBase || { body: 0, focus: 0, nasalTrim: 0, shoutTrim: 0, driveDb: 0, wet: 0, sideTuck: 0 };
      const projectionBoost = clamp((toneMap.midProjectionBoost ?? 1) * midDetailBoost * (0.98 + centerDetailLift * 0.05), 0.80, 1.28);
      const projectionGuard = clamp(Math.max(toneMap.midProjectionGuard ?? 0, midDetailGuard * 0.66, midPaperGuard * 0.62), 0, 1);
      const nasalGuard = clamp(Math.max(toneMap.midNasalGuard ?? 0, toneMap.vocalTickleGuard ?? 0, resonanceGuard * 0.40), 0, 1);
      const shoutGuard = clamp(Math.max(toneMap.midShoutGuard ?? 0, toneMap.midShoutBurst ?? 0, midPaperGuard * 0.55, harshGuard * 0.50, resonanceGuard * 0.30), 0, 1);
      const bassMask = clamp(toneMap.bassMask ?? 0, 0, 1);
      const focusHz = clamp((toneMap.midProjectionHz ?? toneMap.vocalPresenceHz ?? 2050) + centerDetailLift * 50 - midIntelligibilityGuard * 40, 1600, 2400);
      const bodyHz = clamp(toneMap.midProjectionBodyHz ?? 405, 330, 470);
      const sideTuckHz = clamp(toneMap.midProjectionSideTuckHz ?? 1850, 1450, 2350);
      const projectionFactor = clamp(0.46 + f * 0.30 + bassMask * 0.12, 0, 0.98)
        * projectionBoost
        * anchorExcite
        * (1 - projectionGuard * 0.38)
        * (1 - nasalGuard * 0.18)
        * (1 - shoutGuard * 0.22)
        * (1 - midPaperGuard * 0.16)
        * (0.96 + midDetailWindow * 0.08)
        * (1 - mudGuard * 0.08)
        * (1 - resonanceGuard * 0.22);
      const bodyProjectionFactor = clamp(
        projectionFactor * (0.74 + bassMask * 0.10)
        * (1 - mudGuard * 0.44)
        * (1 - nasalGuard * 0.10)
        * (1 - projectionGuard * 0.20),
        0,
        0.92
      );
      c.midProjectHighpass.frequency.setTargetAtTime(clamp(focusHz * 0.42 + bassMask * 55, 720, 1040), now, ramp * 1.8);
      c.midProjectLowpass.frequency.setTargetAtTime(clamp(focusHz + 1380 - shoutGuard * 250 - midPaperGuard * 190, 2850, 4100), now, ramp * 1.8);
      c.midProjectFocus.frequency.setTargetAtTime(focusHz, now, ramp * 1.8);
      c.midProjectNasalGuard.frequency.setTargetAtTime(clamp(toneMap.midNasalHz ?? 980, 820, 1180), now, ramp * 1.8);
      c.midProjectShoutGuard.frequency.setTargetAtTime(clamp(toneMap.midPaperHz ?? toneMap.midShoutHz ?? 3900, 3100, 5050), now, ramp * 1.8);
      c.midProjectFocus.gain.setTargetAtTime(mp.focus * projectionFactor, now, ramp);
      c.midProjectNasalGuard.gain.setTargetAtTime(-Math.abs(mp.nasalTrim + nasalGuard * 0.42 + projectionGuard * 0.12) * clamp(projectionFactor, 0.32, 0.92), now, ramp);
      c.midProjectShoutGuard.gain.setTargetAtTime(-Math.abs(mp.shoutTrim + shoutGuard * 0.48 + midPaperGuard * 0.34 + harshGuard * 0.14) * clamp(projectionFactor, 0.28, 0.90), now, ramp);
      c.midProjectDrive.gain.setTargetAtTime(dbToGain(mp.driveDb * (0.56 + projectionFactor * 0.32) * (1 - nasalGuard * 0.12) * (1 - shoutGuard * 0.14)), now, ramp);
      c.midProjectWet.gain.setTargetAtTime(clamp(mp.wet * projectionFactor, 0, 0.076), now, ramp);

      if (c.midProjectBodyWet) {
        c.midProjectBodyHighpass.frequency.setTargetAtTime(clamp(bodyHz - 130 + bassMask * 12, 245, 335), now, ramp * 1.8);
        c.midProjectBodyLowpass.frequency.setTargetAtTime(clamp(bodyHz + 305 - mudGuard * 70, 610, 760), now, ramp * 1.8);
        c.midProjectBody.frequency.setTargetAtTime(bodyHz, now, ramp * 1.8);
        c.midProjectBody.Q.setTargetAtTime(0.60 + mudGuard * 0.10, now, ramp);
        c.midProjectBodyMudGuard.frequency.setTargetAtTime(clamp((toneMap.upperBodyHonkHz ?? 560) - 60 + mudGuard * 50, 500, 690), now, ramp * 1.8);
        c.midProjectBodyMudGuard.Q.setTargetAtTime(0.70 + mudGuard * 0.20, now, ramp);
        c.midProjectBody.gain.setTargetAtTime(mp.body * bodyProjectionFactor, now, ramp);
        c.midProjectBodyMudGuard.gain.setTargetAtTime(-Math.abs(0.20 + mudGuard * 0.44 + resonanceGuard * 0.18 + nasalGuard * 0.10) * clamp(bodyProjectionFactor, 0.25, 0.84), now, ramp);
        c.midProjectBodyDrive.gain.setTargetAtTime(dbToGain(mp.driveDb * (0.42 + bodyProjectionFactor * 0.24) * (1 - mudGuard * 0.16)), now, ramp);
        c.midProjectBodyWet.gain.setTargetAtTime(clamp(mp.wet * bodyProjectionFactor * 0.72, 0, 0.052), now, ramp);
      }

      c.sideTuckHighpass.frequency.setTargetAtTime(clamp(sideTuckHz - 980, 540, 760), now, ramp * 1.8);
      c.sideTuckLowpass.frequency.setTargetAtTime(clamp(sideTuckHz + 1080, 2350, 3400), now, ramp * 1.8);
      c.sideTuckFocus.frequency.setTargetAtTime(sideTuckHz, now, ramp * 1.8);
      c.sideTuckFocus.gain.setTargetAtTime(clamp(0.20 + projectionFactor * 0.80 + bassMask * 0.16 - projectionGuard * 0.30, 0, 1.20), now, ramp);
      c.sideTuckWet.gain.setTargetAtTime(clamp(mp.sideTuck * projectionFactor * (1 - projectionGuard * 0.48) * (1 - harshGuard * 0.16) * (1 - inputWideNatural * 0.68), 0, 0.024), now, ramp);
    }

    if (c.lowBodyWet) {
      const lb = this.lowMidBodyBase || { focus: 0, mudTrim: 0, driveDb: 0, wet: 0 };
      const bodyFactor = clamp(0.48 + f * 0.34, 0, 0.96) * lowBodyBoost * (1 - resonanceGuard * 0.45);
      c.lowBodyHighpass.frequency.setTargetAtTime(clamp((toneMap.lowBodyHz ?? 255) - 118, 118, 178), now, ramp * 1.8);
      c.lowBodyLowpass.frequency.setTargetAtTime(clamp((toneMap.mudGuardHz ?? 385) + 35, 345, 440), now, ramp * 1.8);
      c.lowBodyFocus.frequency.setTargetAtTime(clamp(toneMap.lowBodyHz ?? 255, 210, 315), now, ramp * 1.8);
      c.lowBodyMudGuard.frequency.setTargetAtTime(clamp(toneMap.mudGuardHz ?? 385, 330, 520), now, ramp * 1.8);
      c.lowBodyFocus.gain.setTargetAtTime(lb.focus * bodyFactor * (1 - mudGuard * 0.30), now, ramp);
      c.lowBodyMudGuard.gain.setTargetAtTime(-Math.abs(lb.mudTrim + mudGuard * 0.55 + resonanceGuard * 0.55) * clamp(bodyFactor, 0.55, 1.0), now, ramp);
      c.lowBodyDrive.gain.setTargetAtTime(dbToGain(lb.driveDb * (0.68 + bodyFactor * 0.24) * (1 - mudGuard * 0.06)), now, ramp);
      c.lowBodyWet.gain.setTargetAtTime(clamp(lb.wet * bodyFactor * (1 - mudGuard * 0.22), 0, 0.074), now, ramp);
    }

    if (c.upperBodyWet) {
      const ub = this.upperMidBodyBase || { focus: 0, honkTrim: 0, driveDb: 0, wet: 0 };
      const upperBodyBoost = clamp((toneMap.upperBodyBoost ?? 1) * midCreamBoost, 0.82, 1.18);
      const upperBodyGuard = clamp(Math.max(toneMap.upperBodyGuard ?? 0, midFormantGuard * 0.72), 0, 1);
      const upperBodyHz = clamp(toneMap.midCreamHz ?? toneMap.upperBodyHz ?? 600, 520, 680);
      const honkHz = clamp(toneMap.upperBodyHonkHz ?? 780, 650, 980);
      const bodyBridgeFactor = clamp(0.42 + f * 0.28, 0, 0.82)
        * upperBodyBoost
        * (1 - upperBodyGuard * 0.56)
        * (1 - mudGuard * 0.24)
        * (1 - resonanceGuard * 0.36);
      c.upperBodyHighpass.frequency.setTargetAtTime(clamp(upperBodyHz - 310, 270, 360), now, ramp * 1.8);
      c.upperBodyLowpass.frequency.setTargetAtTime(clamp(honkHz + 220, 880, 1120), now, ramp * 1.8);
      c.upperBodyFocus.frequency.setTargetAtTime(upperBodyHz, now, ramp * 1.8);
      c.upperBodyFocus.Q.setTargetAtTime(0.48 + upperBodyGuard * 0.10, now, ramp);
      c.upperBodyHonkGuard.frequency.setTargetAtTime(honkHz, now, ramp * 1.8);
      c.upperBodyHonkGuard.Q.setTargetAtTime(0.70 + upperBodyGuard * 0.22, now, ramp);
      c.upperBodyFocus.gain.setTargetAtTime(ub.focus * bodyBridgeFactor, now, ramp);
      c.upperBodyHonkGuard.gain.setTargetAtTime(-Math.abs(ub.honkTrim + upperBodyGuard * 0.42 + resonanceGuard * 0.22) * clamp(bodyBridgeFactor, 0.35, 0.92), now, ramp);
      c.upperBodyDrive.gain.setTargetAtTime(dbToGain(ub.driveDb * (0.64 + bodyBridgeFactor * 0.22) * (1 - upperBodyGuard * 0.16)), now, ramp);
      c.upperBodyWet.gain.setTargetAtTime(clamp(ub.wet * bodyBridgeFactor, 0, 0.048), now, ramp);
    }

    if (c.vocalTickleWet) {
      const vt = this.vocalTickleBase || { focus: 0, guardTrim: 0, driveDb: 0, wet: 0 };
      const tickleBoost = clamp((toneMap.vocalTickleBoost ?? 1) * (0.98 + midDetailNeed * 0.08 + centerDetailLift * 0.04), 0.80, 1.24);
      const tickleGuard = clamp(Math.max(toneMap.vocalTickleGuard ?? 0, midFormantGuard * 0.52, midDetailGuard * 0.22), 0, 1);
      const tickleHz = clamp(toneMap.vocalTickleHz ?? 1150, 1040, 1260);
      const guardHz = clamp(toneMap.vocalTickleGuardHz ?? 1380, 1250, 1580);
      const bassMask = clamp(toneMap.bassMask ?? 0, 0, 1);
      const tickleFactor = clamp(0.48 + f * 0.22 + bassMask * 0.10, 0, 0.88)
        * tickleBoost
        * (1 - tickleGuard * 0.58)
        * (1 - mudGuard * 0.12)
        * (1 - harshGuard * 0.055)
        * (1 - midPaperGuard * 0.08)
        * (0.98 + midDetailWindow * 0.06)
        * (1 - resonanceGuard * 0.26);
      c.vocalTickleHighpass.frequency.setTargetAtTime(clamp(tickleHz - 360, 740, 890), now, ramp * 1.8);
      c.vocalTickleLowpass.frequency.setTargetAtTime(clamp(guardHz + 180, 1420, 1680), now, ramp * 1.8);
      c.vocalTickleFocus.frequency.setTargetAtTime(tickleHz, now, ramp * 1.8);
      c.vocalTickleFocus.Q.setTargetAtTime(0.52 + tickleGuard * 0.08, now, ramp);
      c.vocalTickleResGuard.frequency.setTargetAtTime(guardHz, now, ramp * 1.8);
      c.vocalTickleResGuard.Q.setTargetAtTime(0.78 + tickleGuard * 0.22, now, ramp);
      c.vocalTickleFocus.gain.setTargetAtTime(vt.focus * tickleFactor, now, ramp);
      c.vocalTickleResGuard.gain.setTargetAtTime(-Math.abs(vt.guardTrim + tickleGuard * 0.38 + resonanceGuard * 0.15) * clamp(tickleFactor, 0.32, 0.86), now, ramp);
      c.vocalTickleDrive.gain.setTargetAtTime(dbToGain(vt.driveDb * (0.60 + tickleFactor * 0.24) * (1 - tickleGuard * 0.20)), now, ramp);
      c.vocalTickleWet.gain.setTargetAtTime(clamp(vt.wet * tickleFactor, 0, 0.034), now, ramp);
    }

    if (c.godSideWet) {
      const gp = this.godParticleBase || { sideWet: 0, midWet: 0, driveDb: 0, shimmer: 0, guard: 0, midSparkle: 0, bassPower: 0 };
      const particleAir = clamp(toneMap.godParticleAir ?? 0, 0, 1);
      const particleMid = clamp(toneMap.godParticleMid ?? 0, 0, 1);
      const particleBass = clamp(toneMap.godParticleBass ?? 0, 0, 1);
      const particleStereo = clamp(toneMap.godParticleStereo ?? 1, 0.50, 1.30);
      const particleGuard = clamp(toneMap.godParticleGuard ?? 0, 0, 1);
      const particleTexture = clamp(toneMap.aiHighTexture ?? 0, 0, 1);
      const highSpikeDensity = clamp(toneMap.highSpikeDensity ?? 0, 0, 1);
      const sibilanceBurst = clamp(toneMap.sibilanceBurst ?? 0, 0, 1);
      const glassBurst = clamp(toneMap.glassBurst ?? 0, 0, 1);
      const splashBurst = clamp(toneMap.splashBurst ?? 0, 0, 1);
      const chirpBurst = clamp(toneMap.chirpBurst ?? 0, 0, 1);
      const sheenParticleWindow = clamp(toneMap.sheenParticleWindow ?? 0.58, 0, 1);
      const polishedTrebleWindow = clamp(toneMap.polishedTrebleWindow ?? sheenParticleWindow, 0, 1);
      const sevenTenArtifact = clamp(toneMap.aiSevenTenArtifact ?? Math.max(toneMap.aiGlass ?? 0, toneMap.aiGrain ?? 0, (toneMap.aiSplash ?? 0) * 0.80), 0, 1);
      const sixTwelveArtifact = clamp(toneMap.aiSixTwelveArtifact ?? Math.max(sevenTenArtifact, (toneMap.aiSixEightArtifact ?? 0) * 0.72, (toneMap.aiSplash ?? 0) * 0.82, (toneMap.aiChirp ?? 0) * 0.42), 0, 1);
      const artifactGuard = Math.max(particleGuard, harshGuard * 0.45, resonanceGuard * 0.35, sixTwelveArtifact * 0.72, sevenTenArtifact * 0.55, highSpikeDensity * 0.50, sibilanceBurst * 0.42, glassBurst * 0.48, splashBurst * 0.58, chirpBurst * 0.66);
      const presetId = this.state.selectedPresetId;
      const isSonKuHoregParticles = presetId === 'sonkuhoreg';
      const isSonKuBattleParticles = presetId === 'sonkubattle';
      const isSonKuBalapParticles = presetId === 'sonkubalap';
      const isHoregParticleFamily = isSonKuHoregParticles || isSonKuBattleParticles || isSonKuBalapParticles;
      const horegParticleLift = isSonKuBattleParticles ? 0.20 : (isSonKuBalapParticles ? 0.18 : (isSonKuHoregParticles ? 0.16 : 0));
      const particleFactor = clamp((0.50 + f * 0.56 + horegParticleLift * 0.74) * (1 - musicalRelaxGuard * 0.026) * particleStereo * (0.76 + particleAir * 0.62 + sheenParticleWindow * 0.36 + horegParticleLift * 0.36) * (1 - artifactGuard * (isHoregParticleFamily ? 0.42 : 0.48)) * (1 - sixTwelveArtifact * 0.13) * (0.92 + polishedTrebleWindow * 0.20), 0, isSonKuBalapParticles ? 1.28 : (isSonKuBattleParticles ? 1.32 : (isSonKuHoregParticles ? 1.28 : 1.18)));
      const midFactor = clamp((0.48 + anchorExcite * 0.24 + particleAir * 0.14 + particleMid * 0.40 + Math.min(particleBass, 0.65) * 0.06 + centerDetailLift * 0.12 + horegParticleLift * 0.76) * (1 - artifactGuard * (isHoregParticleFamily ? 0.42 : 0.48)) * (1 - sixTwelveArtifact * 0.12) * (1 - midPaperGuard * 0.10) * (1 - musicalRelaxGuard * 0.028) * (0.96 + polishedTrebleWindow * 0.12 + midDetailWindow * 0.07), 0, isSonKuBalapParticles ? 1.22 : (isSonKuBattleParticles ? 1.26 : (isSonKuHoregParticles ? 1.22 : 1.12)));
      const sourceHz = clamp(toneMap.godParticleSourceHz ?? toneMap.aiEdgePleasantHz ?? 7800, 7200, 9400);
      const midPresenceHz = clamp(toneMap.godParticlePresenceHz ?? toneMap.vocalPresenceHz ?? 2050, 1860, 2250);
      const midSparkleHz = clamp(toneMap.godParticleMidHz ?? toneMap.anchorToneHz ?? 3300, 2600, 4700);
      const sideHz = clamp(toneMap.godParticleAirHz ?? 13200, 12000, 16600);
      const toneHz = clamp(toneMap.godParticleToneHz ?? 15400, 13600, 17800);
      c.godSideHighpass.frequency.setTargetAtTime(clamp(sourceHz + 3300 + sixTwelveArtifact * 1180 + Math.max(splashBurst, chirpBurst, highSpikeDensity) * 620, 11600, 15200), now, ramp * 1.8);
      c.godSideFocus.frequency.setTargetAtTime(clamp(sideHz + sixTwelveArtifact * 620 + splashBurst * 420 + chirpBurst * 520, 12400, 17200), now, ramp * 1.8);
      c.godSideFocus.Q.setTargetAtTime(0.44 + particleTexture * 0.10 - sixTwelveArtifact * 0.060, now, ramp);
      c.godSideTone.frequency.setTargetAtTime(clamp(toneHz + sixTwelveArtifact * 520 + sheenParticleWindow * 240, 13800, 18200), now, ramp * 1.8);
      c.godSideTone.gain.setTargetAtTime(clamp(0.21 + particleAir * 0.48 + sheenParticleWindow * 0.160 + polishedTrebleWindow * 0.095 - artifactGuard * 0.13 - sixTwelveArtifact * 0.055, -0.10, 1.02), now, ramp);
      c.godSideDrive.gain.setTargetAtTime(dbToGain(gp.driveDb * (0.48 + particleFactor * 0.26) * (1 - artifactGuard * 0.28) * (1 - sixTwelveArtifact * 0.16)), now, ramp);
      c.godSideWet.gain.setTargetAtTime(clamp(gp.sideWet * particleFactor * (1 - sixTwelveArtifact * 0.22) * (1.08 + sheenParticleWindow * 0.40), 0, isSonKuBalapParticles ? 0.104 : (isSonKuBattleParticles ? 0.108 : (isSonKuHoregParticles ? 0.106 : 0.098))), now, ramp);

      c.godMidHighpass.frequency.setTargetAtTime(clamp(midPresenceHz - 280 + particleBass * 90, 1580, 2450), now, ramp * 1.8);
      c.godMidFocus.frequency.setTargetAtTime(midSparkleHz, now, ramp * 1.8);
      c.godMidFocus.Q.setTargetAtTime(0.42 + particleMid * 0.18 + particleTexture * 0.08, now, ramp);
      c.godMidTone.frequency.setTargetAtTime(clamp(12200 + particleAir * 3000 + particleMid * 520 + sixTwelveArtifact * 760 + sheenParticleWindow * 280, 11600, 16800), now, ramp * 1.8);
      c.godMidTone.gain.setTargetAtTime(clamp(0.13 + particleAir * 0.19 + particleMid * 0.36 + particleBass * 0.035 + polishedTrebleWindow * 0.070 - artifactGuard * 0.15 - sixTwelveArtifact * 0.065, -0.10, 0.82), now, ramp);
      c.godMidDrive.gain.setTargetAtTime(dbToGain(gp.driveDb * (0.44 + midFactor * 0.26) * (1 - artifactGuard * 0.26) * (1 - sixTwelveArtifact * 0.14)), now, ramp);
      c.godMidWet.gain.setTargetAtTime(clamp(gp.midWet * midFactor * (1 - sixTwelveArtifact * 0.24) * (1 - highSpikeDensity * 0.075), 0, isSonKuBalapParticles ? 0.064 : (isSonKuBattleParticles ? 0.066 : (isSonKuHoregParticles ? 0.064 : 0.052))), now, ramp);
    }

    this.applyAiHighRepair(now, ramp, toneMap);
  }

  applyAiHighRepair(now, ramp, toneMap = null) {
    const c = this.colorNodes;
    if (!c?.aiRepairChirp) return;
    const color = this.state.color || {};
    const base = this.aiHighRepairBase || { amount: 0, velvet: 0, airWet: 0, sideWet: 0 };
    const turboReward = this.performanceMode === 'normal' ? 1 : 0;
    const rawRepairAmount = clamp01((Number(color.aiHighRepair ?? base.amount * 100) || 0) / 100);
    const rawVelvetAmt = clamp01((Number(color.velvetTreble ?? base.velvet * 100 ?? 66) || 0) / 100);
    const map = toneMap || this.dopamineToneMap || createDefaultDopamineToneMap();
    // v0.3.96: repair must be surgical. Open the 6-10 kHz skin detail a little
    // more than before, while the coherence guard still reacts when the source
    // is already bright/wide and phase risk is high.
    const coherenceOpen = clamp01(1 - (map.treblePhaseRisk ?? 0) * 0.10);
    const velvetAmt = clamp01(rawVelvetAmt * (turboReward ? 0.66 : 0.92) * coherenceOpen);
    const repairOpen = rawRepairAmount * (turboReward ? 0.60 : 0.90) * coherenceOpen;
    const amount = clamp01(Math.max(repairOpen, repairOpen + velvetAmt * 0.12, velvetAmt * 0.42));
    const turboDetailPreserve = turboReward ? 0.52 : 1;
    const turboEdgePreserve = turboReward ? 0.78 : 1;
    const presence = clamp(map.aiPresence ?? 0, 0, 1);
    const tickle = clamp(map.aiTickle ?? 0, 0, 1);
    const harsh = clamp(map.aiHarsh ?? map.harshGuard ?? 0, 0, 1);
    const edge = clamp(map.aiEdge ?? harsh * 0.55, 0, 1);
    const glass = clamp(map.aiGlass ?? 0, 0, 1);
    const grain = clamp(map.aiGrain ?? Math.max(glass * 0.42, map.aiSplash * 0.22 || 0), 0, 1);
    const sixEightArtifact = clamp(map.aiSixEightArtifact ?? Math.max(edge * 0.62, glass * 0.74, grain * 0.38), 0, 1);
    const edgeSweetness = clamp(map.aiEdgeSweetness ?? 0, 0, 1);
    const splash = clamp(map.aiSplash ?? 0, 0, 1);
    const sevenTenArtifact = clamp(map.aiSevenTenArtifact ?? Math.max(glass * 0.58, grain * 0.88, splash * 0.74, sixEightArtifact * 0.40), 0, 1);
    const chirp = clamp(map.aiChirp ?? 0, 0, 1);
    // v0.3.64 hotfix: define the full 6-12 kHz artifact density before
    // roundedWindow / velvetProblem use it. v0.3.63 declared this only in
    // the God Particles branch, so applyAiHighRepair could throw
    // "sixTwelveArtifact is not defined" on startup or preset changes.
    const sixTwelveArtifact = clamp(
      map.aiSixTwelveArtifact ?? Math.max(
        sixEightArtifact * 0.72,
        sevenTenArtifact,
        splash * 0.82,
        chirp * 0.48
      ),
      0,
      1
    );
    const fizz = clamp(map.aiFizz ?? 0, 0, 1);
    const crest = clamp(map.aiHighCrest ?? map.resonanceGuard ?? 0, 0, 1);
    const texture = clamp(map.aiHighTexture ?? crest, 0, 1);
    const highSpikeDensity = clamp(map.highSpikeDensity ?? 0, 0, 1);
    const sibilanceBurst = clamp(map.sibilanceBurst ?? Math.max(edge * 0.60, harsh * 0.40), 0, 1);
    const glassBurst = clamp(map.glassBurst ?? Math.max(glass, grain * 0.28), 0, 1);
    const splashBurst = clamp(map.splashBurst ?? Math.max(splash, grain * 0.34), 0, 1);
    const chirpBurst = clamp(map.chirpBurst ?? chirp, 0, 1);
    const sheenParticleWindow = clamp(map.sheenParticleWindow ?? 0.55, 0, 1);
    const polishedTrebleWindow = clamp(map.polishedTrebleWindow ?? sheenParticleWindow, 0, 1);
    const fastTrebleBurst = Math.max(sibilanceBurst * 0.82, glassBurst * 0.92, splashBurst, chirpBurst, highSpikeDensity * 0.76);
    const roundedWindow = clamp(0.76 + edgeSweetness * 0.22 + polishedTrebleWindow * 0.10 - Math.max(splashBurst * 0.34, chirpBurst * 0.38, fizz * 0.20, sixTwelveArtifact * 0.30, highSpikeDensity * 0.18) - texture * 0.08, 0.24, 1);
    const velvetProblem = clamp(Math.max(harsh * 0.52, edge * 0.50, glass * 0.60, grain * 0.66, sixEightArtifact * 0.58, sevenTenArtifact * 0.70, sixTwelveArtifact * 0.78, splash * 0.58, chirp * 0.56, fizz * 0.32) + texture * 0.13 - edgeSweetness * 0.15, 0, 1);

    // v19 vocal-air lift: keep the segmented repair from v18, but avoid a dull result by letting stable vocal-air energy breathe after the artifact bands are controlled.
    // v18 segmented repair: separate the problem zones instead of treating
    // 5-20 kHz as one blanket. This is closer to how dynamic resonance tools
    // work: narrow, context-aware reductions only where the source is glassy,
    // chirpy or splashy, while normal presence and top-end stay alive.
    const bandArtifact = Math.max(
      // Keep 1-8 kHz musical: this area carries vocal air edge, snare detail,
      // and cymbal identity. Only true glass/etch gets trimmed.
      presence * 0.16,
      tickle * 0.22,
      harsh * 0.28,
      edge * 0.26,
      glass * 0.36,
      grain * 0.46,
      sixEightArtifact * 0.40,
      sevenTenArtifact * 0.72,
      sixTwelveArtifact * 0.82,
      splash * 0.90,
      chirp * 1.02,
      fizz * 0.56
    );
    const upperArtifact = Math.max(splash * 0.78, chirp * 1.0, fizz * 0.44, sevenTenArtifact * 0.74, sixTwelveArtifact * 0.86);
    const lowerPresenceArtifact = Math.max(presence * 0.14, tickle * 0.20, harsh * 0.30, sixEightArtifact * 0.42, edge * 0.30, glass * 0.38, grain * 0.40, sevenTenArtifact * 0.48, sixTwelveArtifact * 0.52);
    const target = amount * clamp(upperArtifact * (0.45 + texture * 0.34) + lowerPresenceArtifact * (0.12 + texture * 0.10) + crest * 0.040 + velvetAmt * velvetProblem * 0.20 + fastTrebleBurst * 0.20 + highSpikeDensity * 0.13, 0, 1);
    const alpha = target > this.aiHighRepairMeter ? 0.240 : 0.100;
    this.aiHighRepairMeter += (target - this.aiHighRepairMeter) * alpha;
    const repair = clamp(this.aiHighRepairMeter, 0, 1);
    const preClean = amount * 0.014;

    if (c.aiRepairPresence) {
      c.aiRepairPresence.frequency.setTargetAtTime(clamp(map.aiPresenceHz ?? 2300, 1700, 2900), now, ramp * 1.8);
      c.aiRepairPresence.Q.setTargetAtTime(0.52 + texture * 0.08, now, ramp);
      c.aiRepairPresence.gain.setTargetAtTime(-((amount * presence * (0.060 + velvetAmt * 0.012) + repair * 0.006) * turboDetailPreserve), now, ramp);
    }
    if (c.aiRepairTickle) {
      c.aiRepairTickle.frequency.setTargetAtTime(clamp(map.aiTickleHz ?? 4200, 3300, 5000), now, ramp * 1.8);
      c.aiRepairTickle.Q.setTargetAtTime(0.66 + texture * 0.12, now, ramp);
      c.aiRepairTickle.gain.setTargetAtTime(-((amount * tickle * (0.088 + velvetAmt * 0.016) + repair * 0.008) * turboDetailPreserve), now, ramp);
    }
    c.aiRepairDeHarsh.frequency.setTargetAtTime(clamp(map.aiHarshHz ?? 5600, 5200, 6200), now, ramp * 1.7);
    if (c.aiRepairEdge) c.aiRepairEdge.frequency.setTargetAtTime(clamp(map.aiEdgeHz ?? 6250, 5900, 6700), now, ramp * 1.7);
    if (c.aiRepairGlass) c.aiRepairGlass.frequency.setTargetAtTime(clamp(map.aiGlassHz ?? 7050, 6600, 7500), now, ramp * 1.7);
    if (c.aiRepairGrain) c.aiRepairGrain.frequency.setTargetAtTime(clamp(map.aiGrainHz ?? 7850, 7400, 8500), now, ramp * 1.7);
    c.aiRepairSplash.frequency.setTargetAtTime(clamp(map.aiSplashHz ?? 8800, 8400, 10200), now, ramp * 1.7);
    c.aiRepairChirp.frequency.setTargetAtTime(clamp(map.aiChirpHz ?? 11600, 10200, 14000), now, ramp * 1.7);
    c.aiRepairFizz.frequency.setTargetAtTime(clamp(map.aiFizzHz ?? 14800, 13200, 17800), now, ramp * 1.7);
    c.aiRepairAirShelf.frequency.setTargetAtTime(clamp((map.aiChirpHz ?? 11600) + 1200, 11800, 16800), now, ramp * 1.7);

    // v27 Treble Silk micro-repair. 6-12 kHz is not treated like one top-end shelf:
    // it carries vocal edge, snare snap, cymbal identity, and air entrance, so
    // reduction follows artifact density in small overlapping zones. A separate
    // micro-layer restores rounded particles so the result is sweet, not muted.
    const edgeTrim = clamp((edge * 0.36 + sixEightArtifact * 0.30 + sibilanceBurst * 0.30 + sixTwelveArtifact * 0.10 + texture * 0.06 - edgeSweetness * 0.30), 0, 1);
    const glassTrim = clamp((glass * 0.45 + glassBurst * 0.30 + sixEightArtifact * 0.27 + sevenTenArtifact * 0.16 + sixTwelveArtifact * 0.16 + texture * 0.07 - edgeSweetness * 0.24), 0, 1);
    const grainTrim = clamp((grain * 0.48 + splashBurst * 0.20 + glassBurst * 0.11 + sixEightArtifact * 0.16 + sevenTenArtifact * 0.25 + sixTwelveArtifact * 0.23 + texture * 0.07 - edgeSweetness * 0.18), 0, 1);
    const harshTrim = clamp(harsh * (0.78 + texture * 0.14) + sixTwelveArtifact * 0.08 - edgeSweetness * 0.10, 0, 1);
    c.aiRepairDeHarsh.Q.setTargetAtTime(0.82 + texture * 0.13, now, ramp);
    if (c.aiRepairEdge) c.aiRepairEdge.Q.setTargetAtTime(1.00 + texture * 0.20, now, ramp);
    if (c.aiRepairGlass) c.aiRepairGlass.Q.setTargetAtTime(0.96 + texture * 0.16, now, ramp);
    if (c.aiRepairGrain) c.aiRepairGrain.Q.setTargetAtTime(0.84 + texture * 0.16, now, ramp);
    c.aiRepairSplash.Q.setTargetAtTime(0.72 + texture * 0.14, now, ramp);
    c.aiRepairChirp.Q.setTargetAtTime(0.84 + texture * 0.20, now, ramp);
    c.aiRepairFizz.Q.setTargetAtTime(0.70 + texture * 0.18, now, ramp);
    c.aiRepairDeHarsh.gain.setTargetAtTime(-((preClean * 0.035 + amount * harshTrim * (0.20 + velvetAmt * 0.060) + repair * harshTrim * 0.018) * turboEdgePreserve), now, ramp);
    if (c.aiRepairEdge) c.aiRepairEdge.gain.setTargetAtTime(-((amount * edgeTrim * (0.22 + velvetAmt * 0.040) + repair * edgeTrim * 0.022 + sibilanceBurst * amount * 0.052 + sixTwelveArtifact * amount * 0.008) * turboEdgePreserve), now, ramp);
    if (c.aiRepairGlass) c.aiRepairGlass.gain.setTargetAtTime(-(amount * glassTrim * (0.33 + velvetAmt * 0.064) + repair * glassTrim * 0.034 + glassBurst * amount * 0.074 + sixTwelveArtifact * amount * 0.020), now, ramp);
    if (c.aiRepairGrain) c.aiRepairGrain.gain.setTargetAtTime(-(amount * grainTrim * (0.35 + velvetAmt * 0.068) + repair * grainTrim * 0.036 + splashBurst * amount * 0.060 + sixTwelveArtifact * amount * 0.026), now, ramp);
    c.aiRepairSplash.gain.setTargetAtTime(-(preClean * 0.13 + amount * splash * (0.68 + velvetAmt * 0.10) + splashBurst * amount * 0.115 + repair * 0.074 + sixTwelveArtifact * amount * 0.032), now, ramp);
    c.aiRepairChirp.gain.setTargetAtTime(-(preClean * 0.13 + amount * chirp * (0.76 + velvetAmt * 0.10) + chirpBurst * amount * 0.118 + repair * 0.104 + sixTwelveArtifact * amount * 0.026), now, ramp);
    c.aiRepairFizz.gain.setTargetAtTime(-(amount * fizz * (0.60 + velvetAmt * 0.085) + repair * 0.052), now, ramp);
    c.aiRepairAirShelf.gain.setTargetAtTime(-clamp(repair * 0.016 + amount * Math.max(0, fizz - 0.72) * 0.028 + velvetAmt * velvetProblem * 0.016 + sixTwelveArtifact * amount * 0.014 + fastTrebleBurst * amount * 0.014, 0, 0.095), now, ramp);

    // Natural-air rebuild remains, but it is now tied mostly to upper artifacts.
    // Presence/glass repair should not force extra air; otherwise AI cymbals can
    // become synthetic again. The rebuilt layer is tiny and only restores gloss.
    const silkSourceHz = clamp(map.aiSilkSourceHz ?? 4300, 3300, 5800);
    const silkHpHz = clamp((map.aiSilkAirHz ?? 13400) + sixTwelveArtifact * 420 + velvetAmt * 120 + fastTrebleBurst * 210, 11200, 15800);
    // Vocal Air Lift: restore a little stable 9-13 kHz gloss when the 1-8 kHz
    // bands are not screaming. This brings vocal air forward without re-amplifying
    // the AI cresc/kress texture that lives mostly in splash/chirp/fizz.
    const midHighProblem = Math.max(harshTrim ?? harsh, edgeTrim ?? edge, glassTrim ?? glass, grainTrim ?? grain);
    const vocalAirLift = clamp(amount * 0.031 * (1 - midHighProblem * 0.18) * (0.88 + Math.max(0, 0.70 - texture)) * (1 - sixTwelveArtifact * 0.20) * (0.86 + polishedTrebleWindow * 0.36) + edgeSweetness * amount * 0.009, 0, 0.052);
    const velvetGlossLift = clamp(velvetAmt * (0.010 + edgeSweetness * 0.012 + roundedWindow * 0.016 + sheenParticleWindow * 0.014) * (1 - Math.max(splashBurst * 0.44, chirpBurst * 0.50, fizz * 0.28, midHighProblem * 0.16, sixTwelveArtifact * 0.42, highSpikeDensity * 0.22)), 0, 0.046);
    const relaxGuard = clamp(map.musicalRelaxGuard ?? 0, 0, 1);
    const sweetTickleRecover = clamp((edgeSweetness * 0.60 + polishedTrebleWindow * 0.44 + sheenParticleWindow * 0.40 - sixTwelveArtifact * 0.15 - highSpikeDensity * 0.10), 0, 1);
    const silkGain = clamp(amount * (0.028 + repair * 0.028 + Math.max(0, edgeSweetness - 0.20) * 0.022 + sweetTickleRecover * 0.072) * (1 - midHighProblem * 0.050) * (1 - sixTwelveArtifact * 0.115) * (0.98 + sheenParticleWindow * (0.58 + turboReward * 0.22)) + vocalAirLift * (1.58 + turboReward * 0.22) + velvetGlossLift * (1.24 + turboReward * 0.20) + turboReward * sweetTickleRecover * 0.030 - relaxGuard * 0.0008 - fastTrebleBurst * 0.0013, 0, turboReward ? 0.235 : 0.162);
    c.aiSilkSource.frequency.setTargetAtTime(silkSourceHz, now, ramp * 1.8);
    c.aiSilkSource.Q.setTargetAtTime(0.44 + texture * 0.10, now, ramp);
    c.aiSilkDrive.gain.setTargetAtTime(dbToGain((0.36 + amount * 0.90 + repair * 0.68 + velvetAmt * 0.16) * (1 - sixTwelveArtifact * 0.26)), now, ramp);
    c.aiSilkHighpass.frequency.setTargetAtTime(silkHpHz, now, ramp * 1.8);
    c.aiSilkLowpass.frequency.setTargetAtTime(clamp(silkHpHz + 6200, 16400, 19000), now, ramp * 1.8);
    c.aiSilkTone.frequency.setTargetAtTime(clamp(silkHpHz + 1700, 12800, 17800), now, ramp * 1.8);
    c.aiSilkTone.gain.setTargetAtTime(clamp(0.24 + repair * 0.074 + vocalAirLift * 5.3 + velvetGlossLift * 3.8 + sheenParticleWindow * 0.225 + sweetTickleRecover * 0.245 - glassBurst * 0.050 - sibilanceBurst * 0.038 - splashBurst * 0.046 - sixTwelveArtifact * 0.064, -0.16, 0.86), now, ramp);
    c.aiSilkWet.gain.setTargetAtTime(silkGain, now, ramp);
    c.aiSilkShaper.curve = makeAirExciterCurve((0.23 + amount * 0.58 + repair * 0.52 + velvetAmt * 0.20 + sweetTickleRecover * 0.18) * (1 - velvetProblem * 0.10) * (1 - sixTwelveArtifact * 0.20) * (0.90 + sheenParticleWindow * 0.20), color.mode || 'mastering');

    if (c.aiEdgeWet) {
      const edgeRepairNeed = clamp(Math.max(edgeTrim ?? edge, glassTrim ?? glass, grainTrim * 0.78) * (1 - texture * 0.18), 0, 1);
      const musicalWindow = clamp(0.58 + edgeSweetness * 0.34 - texture * 0.20 - Math.max(splash, chirp) * 0.18, 0.26, 0.96);
      const edgeWet = clamp(amount * (edgeRepairNeed * 0.0038 * musicalWindow + edgeSweetness * 0.0128 + sweetTickleRecover * 0.0102) * (1 - Math.max(splashBurst, chirpBurst, grain, sixTwelveArtifact, highSpikeDensity) * 0.34) + velvetAmt * edgeSweetness * roundedWindow * 0.0036, 0, turboReward ? 0.052 : 0.036);
      c.aiEdgeSource.frequency.setTargetAtTime(clamp(map.aiEdgeSourceHz ?? 5000, 4400, 5700), now, ramp * 1.8);
      c.aiEdgeSource.Q.setTargetAtTime(0.38 + texture * 0.05, now, ramp);
      c.aiEdgeDrive.gain.setTargetAtTime(dbToGain(0.26 + amount * 0.52 + edgeRepairNeed * 0.62), now, ramp);
      c.aiEdgeTone.frequency.setTargetAtTime(clamp((map.aiEdgePleasantHz ?? 6900) - sixTwelveArtifact * 120 + polishedTrebleWindow * 130, 6200, 7600), now, ramp * 1.8);
      c.aiEdgeTone.Q.setTargetAtTime(0.42 + texture * 0.05, now, ramp);
      c.aiEdgeWet.gain.setTargetAtTime(edgeWet, now, ramp);
      c.aiEdgeShaper.curve = makePresenceExciterCurve((0.22 + amount * 0.38 + edgeRepairNeed * 0.34 + sweetTickleRecover * 0.18) * (1 - fastTrebleBurst * 0.11), color.mode || 'mastering');
    }

    if (c.trebleSkinWet) {
      const treblePhaseRisk = clamp(map.treblePhaseRisk ?? 0, 0, 1);
      const skinWindow = clamp((edgeSweetness * 0.44 + polishedTrebleWindow * 0.36 + sweetTickleRecover * 0.38 + sheenParticleWindow * 0.14 - highSpikeDensity * 0.16 - sixTwelveArtifact * 0.18 - treblePhaseRisk * 0.10), 0, 1);
      const baseSkin = this.trebleSkinBase || { wet: 0, focus: 0 };
      c.trebleSkinBand.frequency.setTargetAtTime(clamp(map.trebleClaritySkinHz ?? 8750, 8200, 9300), now, ramp * 1.7);
      c.trebleSkinTone.frequency.setTargetAtTime(clamp(map.trebleClaritySkinHz ?? 8750, 8200, 9300), now, ramp * 1.7);
      c.trebleSkinWet.gain.setTargetAtTime(clamp(baseSkin.wet * (0.92 + skinWindow * (0.74 + turboReward * 0.16)) * (1 - treblePhaseRisk * 0.18), 0, turboReward ? 0.064 : 0.046), now, ramp);
    }

    const topArtifact = clamp(Math.max(splash * 0.54, chirp * 0.78, fizz * 0.42, sixTwelveArtifact * 0.70) * amount, 0, 1);
    if (c.airWet && Number.isFinite(base.airWet)) c.airWet.gain.setTargetAtTime(base.airWet * (1 - repair * 0.005 - midHighProblem * 0.012 - sixTwelveArtifact * 0.026 + vocalAirLift * (1.04 + turboReward * 0.20) + velvetGlossLift * (0.88 + turboReward * 0.16) + edgeSweetness * amount * (0.024 + turboReward * 0.010) + sweetTickleRecover * (0.126 + turboReward * 0.050) + turboReward * sheenParticleWindow * 0.040), now, ramp);
    if (c.sideWet && Number.isFinite(base.sideWet)) c.sideWet.gain.setTargetAtTime(base.sideWet * (1 - topArtifact * 0.024 - repair * 0.003 - midHighProblem * 0.008 - sixTwelveArtifact * 0.026 + velvetAmt * edgeSweetness * roundedWindow * 0.020 + sweetTickleRecover * (0.132 + turboReward * 0.056) + turboReward * sheenParticleWindow * 0.044), now, ramp);
  }

  computeDopamineToneMap() {
    if (!this.context || !this.inputAnalyser || !this.inputFrequencyData) return this.dopamineToneMap || createDefaultDopamineToneMap();
    const nowMs = Date.now();
    if (this.lastDopamineToneAt && nowMs - this.lastDopamineToneAt < 95) return this.dopamineToneMap || createDefaultDopamineToneMap();
    this.inputAnalyser.getFloatFrequencyData(this.inputFrequencyData);
    const next = analyseDopamineToneMap(this.inputFrequencyData, this.context.sampleRate, this.inputAnalyser.fftSize);
    const stereo = this.lastInputStereo || { width: 0, correlation: 1, energy: 0 };
    const sourceWide = clamp(((Number(stereo.width) || 0) - 94) / 104, 0, 1);
    const sourceLowCorr = clamp((0.48 - clamp(Number(stereo.correlation ?? 1), -1, 1)) / 0.70, 0, 1);
    next.treblePhaseRisk = clamp(
      sourceWide * 0.38
        + sourceLowCorr * 0.42
        + (next.aiSixTwelveArtifact || 0) * 0.30
        + (next.aiSevenTenArtifact || 0) * 0.18
        + (next.highSpikeDensity || 0) * 0.22
        - (next.aiEdgeSweetness || 0) * 0.10,
      0,
      1
    );
    const prev = this.dopamineToneMap || createDefaultDopamineToneMap();
    // v0.3.74 Open Tickle Runtime: tone shape remains smooth, but
    // treble and mid-detail burst indicators rise faster than normal macro tone values. This
    // approximates split-band de-essing/spectral dynamics in a lightweight
    // Web Audio runtime: catch sibilance/splash/chirp and shout/paper quickly, release musically.
    const fastTrebleKeys = new Set([
      'highSpikeDensity', 'sibilanceBurst', 'glassBurst', 'splashBurst', 'chirpBurst',
      'midShoutBurst', 'midPaperBurst', 'midPaperGuard', 'midIntelligibilityGuard',
      'aiHarsh', 'aiEdge', 'aiGlass', 'aiGrain', 'aiSplash', 'aiChirp',
      'aiSixEightArtifact', 'aiSevenTenArtifact', 'aiSixTwelveArtifact', 'godParticleGuard', 'treblePhaseRisk'
    ]);
    const smooth = { ...prev };
    for (const key of Object.keys(next)) {
      const v = Number(next[key]);
      const p = Number(prev[key]);
      if (!Number.isFinite(v) || !Number.isFinite(p)) {
        smooth[key] = v;
        continue;
      }
      const rising = v > p;
      const alpha = fastTrebleKeys.has(key)
        ? (rising ? 0.42 : 0.18)
        : (rising ? 0.20 : 0.12);
      smooth[key] = p + (v - p) * alpha;
    }
    this.dopamineToneMap = smooth;
    this.lastDopamineToneAt = nowMs;
    return smooth;
  }

  updateAdaptiveColorStereo(inputStereo) {
    if (!this.context || !this.colorNodes?.sideMidWet) return;
    const now = this.context.currentTime;
    const ramp = 0.16;
    // Smart, source-aware mid-side tickle. Driven by the INPUT stereo character
    // (open-loop -> cannot feedback-oscillate). Material that genuinely has mid
    // stereo detail gets pushed harder; near-mono material is left gentle so we
    // never fabricate phasey width; extreme/anti-phase content eases back. The
    // exciter only ever touches the real Side, so mono stays bit-clean.
    const toneMap = this.computeDopamineToneMap();
    let target = 0.62;
    const enabled = this.state.color?.enabled && (this.state.color?.mix || 0) > 0 && (this.state.color?.stereoMid || 0) > 0;
    if (enabled) {
      const corr = clamp(Number(inputStereo?.correlation ?? 1), -1, 1);
      const sourceWidth = clamp(Number(inputStereo?.width ?? 0), 0, 220);
      const energy = Number(inputStereo?.energy ?? 0);
      if (Number.isFinite(energy) && energy >= 0.0015) {
        const stereoRich = clamp((0.98 - corr) / 0.68, 0, 1);
        const widthRich = clamp(sourceWidth / 72, 0, 1);
        target = 0.66 + Math.max(stereoRich, widthRich * 0.98) * 1.02;
        target *= clamp(toneMap.sideExcite ?? 1, 0.84, 1.28);
        target *= (1 - clamp(Number(toneMap.treblePhaseRisk ?? 0), 0, 1) * 0.18);
        const extreme = clamp((0.04 - corr) / 0.46, 0, 1);
        target *= (1 - extreme * 0.46);
      }
    } else {
      target = 0;
    }
    this.colorStereoAdaptive += (target - this.colorStereoAdaptive) * 0.16;
    if (this.colorStereoAdaptive < 0.0005) this.colorStereoAdaptive = 0;
    this.applySideMidGains(now, ramp);
  }

  computeMeters({ force = false, includeStereoBands = true } = {}) {
    const config = getPerfConfig(this.performanceMode);
    if (config.basicMetersOnly && !force) return this.computeBasicMeterFrame({ force });
    return this.runAdaptiveAudioFrame({ force, includeStereoBands: config.basicMetersOnly ? false : includeStereoBands });
  }

  computeStereoBandMetrics() {
    const fallbacks = {
      low: { width: 0, correlation: 1 },
      mid: { width: 0, correlation: 1 },
      high: { width: 0, correlation: 1 }
    };
    if (!this.stereoBands?.length) return fallbacks;
    const result = { ...fallbacks };
    for (const band of this.stereoBands) {
      if (!band.leftAnalyser || !band.rightAnalyser || !band.leftBuffer || !band.rightBuffer) continue;
      band.leftAnalyser.getFloatTimeDomainData(band.leftBuffer);
      band.rightAnalyser.getFloatTimeDomainData(band.rightBuffer);
      result[band.id] = analyseStereoBand(band.leftBuffer, band.rightBuffer);
    }
    return result;
  }

  getPublicState(metersOverride = null) {
    const meters = metersOverride || this.state.meters || createSilentMeters();
    return {
      ...this.state,
      eq: normalizeEqBands(this.state.eq),
      meters
    };
  }
}

function getPeak(buffer) {
  let peak = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const abs = Math.abs(buffer[i]);
    if (abs > peak) peak = abs;
  }
  return Math.min(1, peak);
}

function computeCorrelation(left, right) {
  let lr = 0;
  let ll = 0;
  let rr = 0;
  const n = Math.min(left.length, right.length);
  for (let i = 0; i < n; i += 1) {
    const l = left[i];
    const r = right[i];
    lr += l * r;
    ll += l * l;
    rr += r * r;
  }
  const denom = Math.sqrt(ll * rr);
  return denom > 1e-12 ? clamp(lr / denom, -1, 1) : 1;
}

function analyseStereoBand(left, right) {
  let midPower = 0;
  let sidePower = 0;
  let totalPower = 0;
  const n = Math.min(left.length, right.length);
  for (let i = 0; i < n; i += 1) {
    const l = left[i];
    const r = right[i];
    const mid = (l + r) * 0.5;
    const side = (l - r) * 0.5;
    midPower += mid * mid;
    sidePower += side * side;
    totalPower += l * l + r * r;
  }
  const energy = Math.sqrt(totalPower / Math.max(1, n * 2));
  if (!Number.isFinite(energy) || energy < 0.0025) return { width: 0, correlation: 1, energy, sideRatio: 0 };
  const correlation = computeCorrelation(left, right);
  const ratio = Math.sqrt(sidePower / Math.max(midPower, 1e-9));
  const width = clamp(ratio * 140, 0, 220);
  return { width, correlation, energy, sideRatio: ratio };
}

function createDefaultDopamineToneMap() {
  return {
    lowMidGlue: 1,
    lowBodyBoost: 1,
    smartBass: 1,
    bassPunchBoost: 1,
    bassPunchHz: 125,
    bassTransient: 0,
    bassSustainGuard: 0,
    bassFatigueGuard: 0,
    bassWarmthGuard: 0,
    subPressure: 0,
    bassMotion: 0,
    bassBreathing: 1,
    subGovernor: 0,
    glerrrTorque: 0,
    bassTorqueKeeper: 0,
    bassTorqueHz: 76,
    punchBreather: 0,
    warmBodyAuto: 0,
    midlowSpaceGuard: 0,
    psychoBassRelief: 0,
    lowEndPocket: 1,
    subBassSmile: 0,
    bassGrooveLift: 0,
    bassDensityGuard: 0,
    midlowUnmask: 0,
    vocalPocketOpen: 0,
    lowEndAirSpace: 1,
    vocalBodyGuard: 1,
    vocalBodyEqHz: 490,
    vocalTickleBoost: 1,
    vocalPresenceBoost: 1,
    vocalPresenceHz: 2050,
    vocalPresenceGuard: 0,
    vocalPresenceGuardHz: 2550,
    vocalTickleHz: 1150,
    vocalTickleGuard: 0,
    vocalTickleGuardHz: 1380,
    bassMask: 0,
    upperBodyBoost: 1,
    upperBodyHz: 600,
    upperBodyGuard: 0,
    upperBodyHonkHz: 780,
    mudGuard: 0,
    lowBodyHz: 255,
    mudGuardHz: 385,
    anchorExcite: 1,
    sideExcite: 1,
    harshGuard: 0,
    resonanceGuard: 0,
    musicalRelaxGuard: 0,
    anchorLowHz: 620,
    anchorFocusHz: 2050,
    anchorToneHz: 3180,
    sideFocusHz: 2380,
    tickleToneHz: 3600,
    midProjectionBoost: 1,
    midProjectionGuard: 0,
    midNasalGuard: 0,
    midShoutGuard: 0,
    midProjectionHz: 2050,
    midProjectionBodyHz: 405,
    midNasalHz: 980,
    midShoutHz: 3600,
    midProjectionSideTuckHz: 1850,
    aiPresence: 0,
    aiTickle: 0,
    aiHarsh: 0,
    aiEdge: 0,
    aiGlass: 0,
    aiGrain: 0,
    aiSixEightArtifact: 0,
    aiSevenTenArtifact: 0,
    aiSixTwelveArtifact: 0,
    aiSourceNaturalness: 1,
    aiEdgeSweetness: 0,
    aiSplash: 0,
    aiChirp: 0,
    aiFizz: 0,
    aiHighCrest: 0,
    aiHighTexture: 0,
    highSpikeDensity: 0,
    sibilanceBurst: 0,
    glassBurst: 0,
    splashBurst: 0,
    chirpBurst: 0,
    sheenParticleWindow: 0.6,
    polishedTrebleWindow: 0.6,
    midDetailNeed: 0,
    midDetailWindow: 0.65,
    midDetailBoost: 1,
    midDetailGuard: 0,
    midCreamBoost: 1,
    midCreamHz: 560,
    midFormantGuard: 0,
    midFormantHz: 820,
    midIntelligibilityBoost: 1,
    midIntelligibilityHz: 2600,
    midIntelligibilityGuard: 0,
    midPaperGuard: 0,
    midPaperHz: 4400,
    midShoutBurst: 0,
    midPaperBurst: 0,
    centerDetailLift: 0,
    midDetailDensity: 0,
    godParticleAir: 0,
    godParticleMid: 0,
    godParticleBass: 0,
    godParticleStereo: 1,
    godParticleGuard: 0,
    godParticleSourceHz: 8600,
    godParticleMidHz: 3100,
    godParticlePresenceHz: 2050,
    godParticleAirHz: 13200,
    godParticleToneHz: 15200,
    aiSilkSourceHz: 4300,
    aiSilkAirHz: 11800,
    aiPresenceHz: 2300,
    aiTickleHz: 4200,
    aiHarshHz: 5600,
    aiEdgeHz: 6250,
    aiGlassHz: 7050,
    aiGrainHz: 7850,
    aiEdgeSourceHz: 5000,
    aiEdgePleasantHz: 6950,
    trebleClaritySkinHz: 8750,
    treblePhaseRisk: 0,
    aiSplashHz: 8800,
    aiChirpHz: 11200,
    aiFizzHz: 14200
  };
}

function analyseDopamineToneMap(freqData, sampleRate, fftSize) {
  if (!freqData || !sampleRate || !fftSize) return createDefaultDopamineToneMap();
  const nyquist = sampleRate / 2;
  const binHz = sampleRate / fftSize;
  const clampBin = (hz) => clamp(Math.round(hz / binHz), 0, freqData.length - 1);
  const bandPower = (lo, hi) => {
    const a = clampBin(lo);
    const b = Math.max(a, clampBin(Math.min(hi, nyquist - 10)));
    let sum = 0;
    let n = 0;
    for (let i = a; i <= b; i += 1) {
      const db = Number(freqData[i]);
      if (!Number.isFinite(db)) continue;
      sum += Math.pow(10, db / 10);
      n += 1;
    }
    return n ? sum / n : 1e-12;
  };
  const weightedFreq = (lo, hi, fallback) => {
    const a = clampBin(lo);
    const b = Math.max(a, clampBin(Math.min(hi, nyquist - 10)));
    let sum = 0;
    let weight = 0;
    for (let i = a; i <= b; i += 1) {
      const db = Number(freqData[i]);
      if (!Number.isFinite(db)) continue;
      const p = Math.pow(10, db / 10);
      const freq = i * binHz;
      sum += freq * p;
      weight += p;
    }
    return weight > 1e-12 ? sum / weight : fallback;
  };
  const spectralCrest = (lo, hi) => {
    const a = clampBin(lo);
    const b = Math.max(a, clampBin(Math.min(hi, nyquist - 10)));
    let sum = 0;
    let max = 0;
    let n = 0;
    for (let i = a; i <= b; i += 1) {
      const db = Number(freqData[i]);
      if (!Number.isFinite(db)) continue;
      const p = Math.pow(10, db / 10);
      sum += p;
      if (p > max) max = p;
      n += 1;
    }
    const avg = n ? sum / n : 1e-12;
    return clamp(linearToDb(max / Math.max(avg, 1e-12)) / 18, 0, 1);
  };

  const broad = Math.max(bandPower(180, 7600), 1e-12);
  const subPressureBand = bandPower(24, 48) / broad;
  const kickFund = bandPower(48, 95) / broad;
  const bassFund = bandPower(70, 135) / broad;
  const warmBassBand = bandPower(115, 210) / broad;
  const torqueBand = bandPower(55, 95) / broad;
  const punchZoneBand = bandPower(95, 160) / broad;
  const warmBodyZone = bandPower(160, 280) / broad;
  const midlowSpaceZone = bandPower(280, 520) / broad;
  const bassBodyBand = bandPower(180, 320) / broad;
  const punch = bandPower(160, 320) / broad;
  const vocalBody = bandPower(200, 310) / broad;
  const mudBox = bandPower(330, 520) / broad;
  const lowMid = bandPower(360, 780) / broad;
  const upperBody = bandPower(520, 720) / broad;
  const bodyBridge = bandPower(300, 1000) / broad;
  const upperHonk = bandPower(720, 1050) / broad;
  const center = bandPower(900, 1750) / broad;
  const vocalTickleBand = bandPower(1030, 1280) / broad;
  const vocalTickleRes = bandPower(1280, 1580) / broad;
  const vocalMemoryBand = bandPower(1780, 2320) / broad;
  const vocalMemoryRes = bandPower(2350, 2850) / broad;
  const midCreamBand = bandPower(420, 700) / broad;
  const midFormantBand = bandPower(650, 950) / broad;
  const midTactileBand = bandPower(1050, 1350) / broad;
  const midProjectionBand = bandPower(1600, 2350) / broad;
  const midIntelligibilityBand = bandPower(2350, 2900) / broad;
  const midShoutDetailBand = bandPower(2900, 3800) / broad;
  const midPaperBand = bandPower(3800, 5200) / broad;
  const midNasalBand = bandPower(820, 1180) / broad;
  const midShoutBand = bandPower(3150, 4300) / broad;
  const vocal = bandPower(1550, 2850) / broad;
  const tickle = bandPower(2850, 4550) / broad;
  const presenceBand = bandPower(1500, 3000) / broad;
  const tickleBand = bandPower(3000, 5200) / broad;
  const harsh = bandPower(5200, 6100) / broad;
  const edgeBand = bandPower(5900, 6700) / broad;
  const glassCoreBand = bandPower(6600, 7500) / broad;
  const grainBand = bandPower(7400, 8500) / broad;
  const glassBand = (edgeBand + glassCoreBand + grainBand) / 3;
  const splashBand = bandPower(8400, 10200) / broad;
  const sheenBand = bandPower(10000, 12000) / broad;
  const chirpBand = bandPower(10200, 14000) / broad;
  const fizzBand = bandPower(14000, 18000) / broad;
  const airBand = bandPower(9800, 18000) / broad;
  const aiPresenceCrest = spectralCrest(1500, 3000);
  const aiTickleCrest = spectralCrest(3000, 5200);
  const bassPunchCrest = spectralCrest(48, 115);
  const torqueCrest = spectralCrest(55, 95);
  const punchZoneCrest = spectralCrest(95, 160);
  const warmBodyCrest = spectralCrest(160, 280);
  const midlowSpaceCrest = spectralCrest(280, 520);
  const bassSustainCrest = spectralCrest(24, 210);
  const upperBodyCrest = spectralCrest(520, 760);
  const upperHonkCrest = spectralCrest(720, 1050);
  const vocalTickleCrest = spectralCrest(1030, 1280);
  const vocalTickleResCrest = spectralCrest(1280, 1580);
  const vocalMemoryCrest = spectralCrest(1780, 2320);
  const vocalMemoryResCrest = spectralCrest(2350, 2850);
  const midCreamCrest = spectralCrest(420, 700);
  const midFormantCrest = spectralCrest(650, 950);
  const midTactileCrest = spectralCrest(1050, 1350);
  const midProjectionCrest = spectralCrest(1600, 2350);
  const midIntelligibilityCrest = spectralCrest(2350, 2900);
  const midShoutDetailCrest = spectralCrest(2900, 3800);
  const midPaperCrest = spectralCrest(3800, 5200);
  const midNasalCrest = spectralCrest(820, 1180);
  const midShoutCrest = spectralCrest(3150, 4300);
  const aiHarshCrest = spectralCrest(5200, 6100);
  const aiEdgeCrest = spectralCrest(5900, 6700);
  const aiGlassCrest = spectralCrest(6600, 7500);
  const aiGrainCrest = spectralCrest(7400, 8500);
  const aiSplashCrest = spectralCrest(8400, 10200);
  const aiSheenCrest = spectralCrest(10000, 12000);
  const aiChirpCrest = spectralCrest(10200, 14000);
  const aiFizzCrest = spectralCrest(14000, 18000);
  const aiHighCrest = Math.max(aiPresenceCrest * 0.58, aiTickleCrest * 0.68, aiHarshCrest, aiEdgeCrest, aiGlassCrest, aiGrainCrest, aiSplashCrest, aiChirpCrest, aiFizzCrest);

  const lowMidNeed = clamp((0.44 - lowMid) / 0.36, 0, 1);
  const bodyNeed = clamp((0.34 - vocalBody) / 0.30, 0, 1);
  const mudGuard = clamp((mudBox - vocalBody * 0.78 - 0.10) / 0.34, 0, 1);
  const upperBodyNeed = clamp((0.26 + vocal * 0.28 + center * 0.16 - upperBody * 0.92 - bodyBridge * 0.10) / 0.36, 0, 1);
  const upperBodyBadResonance = clamp(Math.max(
    (upperHonk - upperBody * 0.74 - 0.08) / 0.34,
    upperBodyCrest * 0.72 - 0.34,
    upperHonkCrest * 0.82 - 0.30
  ), 0, 1);
  const vocalNeed = clamp((0.52 - vocal) / 0.42, 0, 1);
  const centerNeed = clamp((0.40 - center) / 0.34, 0, 1);
  const bodyHeavy = clamp((punch + lowMid + mudBox * 0.7 - 1.08) / 0.86, 0, 1);
  const subPressure = clamp((subPressureBand * 0.85 + bassFund * 0.18 - 0.16) / 0.58, 0, 1);
  const bassTransient = clamp((kickFund * 0.50 + bassPunchCrest * 0.72 - warmBassBand * 0.16 - subPressure * 0.18 - 0.30) / 0.72, 0, 1);
  const bassSustainGuard = clamp((subPressureBand * 0.36 + warmBassBand * 0.34 + bassBodyBand * 0.30 + lowMid * 0.22 - bassPunchCrest * 0.12 - vocalTickleBand * 0.18 - center * 0.16 - 0.34) / 0.72, 0, 1);
  const bassWarmthGuard = clamp((warmBassBand * 0.36 + bassBodyBand * 0.34 + mudBox * 0.32 - vocalBody * 0.18 - center * 0.12 - 0.32) / 0.68, 0, 1);
  const bassFatigueGuard = clamp(bassSustainGuard * 0.64 + subPressure * 0.34 + Math.max(0, bodyHeavy - 0.34) * 0.30 + Math.max(0, mudBox - vocalBody * 0.78) * 0.25 - bassTransient * 0.10, 0, 1);
  const bassPunchHz = clamp(weightedFreq(52, 145, 118), 58, 145);
  const bassTorqueHz = clamp(weightedFreq(55, 95, 76), 58, 96);
  const bassMask = clamp((punch * 0.36 + lowMid * 0.42 + bodyBridge * 0.30 - center * 0.20 - vocalTickleBand * 0.28 - 0.35) / 0.62, 0, 1);
  const bassMotion = clamp((bassTransient * 0.56 + Math.max(0, bassPunchCrest - bassSustainCrest * 0.56) * 0.36 + punchZoneCrest * 0.18 - subPressure * 0.16 - bassFatigueGuard * 0.10), 0, 1);
  const subGovernor = clamp((subPressure * 0.58 + bassSustainGuard * 0.28 + bassFatigueGuard * 0.24 + Math.max(0, subPressureBand - torqueBand * 0.82) * 0.52 - bassTransient * 0.18), 0, 1);
  const glerrrTorque = clamp((torqueBand * 0.48 + kickFund * 0.20 + torqueCrest * 0.18 + bassMotion * 0.14 - subPressure * 0.18 - bassFatigueGuard * 0.22), 0, 1);
  const punchBreather = clamp((bassTransient * 0.68 + punchZoneBand * 0.22 + punchZoneCrest * 0.18 - bassSustainGuard * 0.20 - subPressure * 0.12 - warmBodyZone * 0.08), 0, 1);
  const warmBodyAuto = clamp((0.24 + bodyNeed * 0.32 + vocalBody * 0.10 + bassMotion * 0.06 - warmBodyZone * 0.62 - bassWarmthGuard * 0.24 - mudGuard * 0.18 - warmBodyCrest * 0.06) / 0.54, 0, 1);
  const bassBreathing = clamp(1 - (bassFatigueGuard * 0.42 + subGovernor * 0.30 + bassSustainGuard * 0.24 + bodyHeavy * 0.16 + midlowSpaceCrest * 0.06) + bassMotion * 0.34 + glerrrTorque * 0.12, 0, 1);
  const psychoBassRelief = clamp(subGovernor * 0.46 + bassFatigueGuard * 0.30 + bassWarmthGuard * 0.16 + bodyHeavy * 0.10 - bassMotion * 0.18 - glerrrTorque * 0.08, 0, 1);
  const midProjectionNeed = clamp((0.32 + vocalNeed * 0.12 + bassMask * 0.11 + centerNeed * 0.08 - midProjectionBand * 0.72 - bodyHeavy * 0.04) / 0.42, 0, 1);
  const midlowSpaceGuard = clamp((midlowSpaceZone * 0.44 + bassMask * 0.36 + mudGuard * 0.30 + bassWarmthGuard * 0.20 + midProjectionNeed * 0.16 - center * 0.14 - vocalTickleBand * 0.18 - 0.26) / 0.66, 0, 1);
  // v0.3.76 Vocal Pocket Low-End map. Keep the 55-95 Hz glerrr torque,
  // but carve the 160-520 Hz bass body/harmonic pocket more aggressively when
  // center vocal/mid detail asks for space. The goal is bass behind the vocal:
  // deep, round, musical, never sitting on top of words/snare/guitar.
  const bassDensityGuard = clamp(bassSustainGuard * 0.42 + bassWarmthGuard * 0.30 + midlowSpaceGuard * 0.26 + bodyHeavy * 0.18 + subGovernor * 0.12 - bassMotion * 0.20 - punchBreather * 0.12, 0, 1);
  const lowEndPocket = clamp(1.00 + glerrrTorque * 0.078 + bassMotion * 0.070 + punchBreather * 0.052 - subGovernor * 0.095 - bassDensityGuard * 0.122 - midlowSpaceGuard * 0.092 - midProjectionNeed * 0.028, 0.82, 1.13);
  const subBassSmile = clamp(glerrrTorque * 0.28 + bassMotion * 0.18 - subGovernor * 0.42 - bassFatigueGuard * 0.30, 0, 1);
  const bassGrooveLift = clamp(bassMotion * 0.42 + punchBreather * 0.34 + glerrrTorque * 0.18 - bassSustainGuard * 0.28 - subGovernor * 0.16, 0, 1);
  const vocalPocketOpen = clamp(midProjectionNeed * 0.42 + vocalNeed * 0.22 + bassMask * 0.34 + midlowSpaceGuard * 0.42 + midIntelligibilityBand * 0.14 - vocalTickleBand * 0.10 - center * 0.08, 0, 1);
  const midlowUnmask = clamp(midlowSpaceGuard * 0.72 + bassMask * 0.48 + mudGuard * 0.34 + bassDensityGuard * 0.24 + vocalPocketOpen * 0.38 + midProjectionNeed * 0.12 - center * 0.14 - vocalTickleBand * 0.12, 0, 1);
  const lowEndAirSpace = clamp(1.00 + bassBreathing * 0.052 + bassGrooveLift * 0.030 - midlowUnmask * 0.125 - vocalPocketOpen * 0.070 - subGovernor * 0.060 - bassDensityGuard * 0.082, 0.80, 1.07);
  const vocalTickleNeed = clamp((0.24 + vocal * 0.20 + center * 0.18 + bassMask * 0.12 - vocalTickleBand * 0.88 - bodyHeavy * 0.06) / 0.36, 0, 1);
  const vocalTickleBadResonance = clamp(Math.max(
    (vocalTickleRes - vocalTickleBand * 0.64 - 0.075) / 0.30,
    vocalTickleCrest * 0.76 - 0.30,
    vocalTickleResCrest * 0.86 - 0.28
  ), 0, 1);
  const vocalPresenceNeed = clamp((0.30 + center * 0.18 + bassMask * 0.10 + vocalTickleBand * 0.08 - vocalMemoryBand * 0.82 - bodyHeavy * 0.03) / 0.38, 0, 1);
  const vocalPresenceBadResonance = clamp(Math.max(
    (vocalMemoryRes - vocalMemoryBand * 0.66 - 0.085) / 0.34,
    vocalMemoryCrest * 0.66 - 0.30,
    vocalMemoryResCrest * 0.86 - 0.28
  ), 0, 1);
  const midNasalGuard = clamp(Math.max(
    (midNasalBand - center * 0.52 - vocalTickleBand * 0.18 - 0.10) / 0.34,
    midNasalCrest * 0.74 - 0.30,
    upperHonkCrest * 0.48 - 0.22
  ), 0, 1);
  const midShoutGuardRaw = clamp(Math.max(
    (midShoutBand - vocal * 0.34 - tickleBand * 0.18 - 0.14) / 0.42,
    midShoutCrest * 0.82 - 0.32,
    aiTickleCrest * 0.28 - 0.10
  ), 0, 1);
  const tickleReady = clamp((vocal * 0.55 + tickle * 0.65 - 0.20) / 0.62, 0, 1);
  const harshGuard = clamp((harsh - 0.34) / 0.46, 0, 1);
  const resonanceGuard = Math.max(
    spectralCrest(200, 520),
    spectralCrest(1450, 2850),
    spectralCrest(2850, 4700),
    spectralCrest(5200, 7800)
  );
  const midShoutGuard = clamp(Math.max(midShoutGuardRaw, harshGuard * 0.62, resonanceGuard * 0.28), 0, 1);
  const midProjectionGuard = clamp(Math.max(midNasalGuard * 0.58, midShoutGuard * 0.72, vocalPresenceBadResonance * 0.42, resonanceGuard * 0.38), 0, 1);
  // v0.3.74 Open Dopamine Low-End Engine. Top global masters do not simply push
  // 2 kHz; they reveal micro-detail in the center while dynamically relaxing
  // nasal, shout, paper, and scrape zones. These lightweight spectral-density
  // indicators steer the existing coherent Mid branches without adding a new UI.
  const midCoreAverage = (midTactileBand + vocalMemoryBand + midProjectionBand + midIntelligibilityBand) / 4;
  const midDetailDensity = clamp((midCoreAverage * 0.54 + Math.max(midTactileCrest, vocalMemoryCrest, midIntelligibilityCrest) * 0.34 + vocal * 0.12 - bodyHeavy * 0.08 - 0.18) / 0.72, 0, 1);
  const midDetailNeed = clamp((0.36 + vocalNeed * 0.14 + centerNeed * 0.10 + bassMask * 0.12 - midCoreAverage * 0.72 - bodyHeavy * 0.05 - midProjectionGuard * 0.12) / 0.46, 0, 1);
  const midCreamNeed = clamp((0.28 + vocal * 0.14 + midDetailNeed * 0.10 - midCreamBand * 0.82 - mudGuard * 0.18 - bodyHeavy * 0.07) / 0.40, 0, 1);
  const midFormantGuard = clamp(Math.max(
    (midFormantBand - midTactileBand * 0.62 - 0.080) / 0.32,
    midFormantCrest * 0.78 - 0.30,
    midNasalGuard * 0.56
  ), 0, 1);
  const midIntelligibilityNeed = clamp((0.24 + midProjectionBand * 0.16 + vocalNeed * 0.08 - midIntelligibilityBand * 0.82 - midShoutGuardRaw * 0.10) / 0.38, 0, 1);
  const midIntelligibilityGuard = clamp(Math.max(
    (midIntelligibilityBand - vocalMemoryBand * 0.68 - 0.090) / 0.32,
    midIntelligibilityCrest * 0.78 - 0.30,
    vocalPresenceBadResonance * 0.62,
    midShoutGuardRaw * 0.30
  ), 0, 1);
  const midShoutBurst = clamp((midShoutDetailBand * 0.44 + midShoutDetailCrest * 0.56 + midShoutGuardRaw * 0.24 + aiTickleCrest * 0.16 - vocal * 0.12 - 0.24) / 0.78, 0, 1);
  const midPaperBurst = clamp((midPaperBand * 0.48 + midPaperCrest * 0.58 + aiTickleCrest * 0.30 + midShoutDetailCrest * 0.10 - tickleReady * 0.12 - 0.24) / 0.80, 0, 1);
  const midPaperGuard = clamp(Math.max(midPaperBurst * 0.86, aiTickleCrest * 0.28, aiHarshCrest * 0.18, harshGuard * 0.42, resonanceGuard * 0.26), 0, 1);
  const midDetailGuard = clamp(Math.max(midFormantGuard * 0.56, midIntelligibilityGuard * 0.64, midShoutBurst * 0.72, midPaperGuard * 0.72, resonanceGuard * 0.34), 0, 1);
  const midDetailWindow = clamp(0.72 + midDetailNeed * 0.16 + midDetailDensity * 0.12 - midDetailGuard * 0.42 - bodyHeavy * 0.10 - harshGuard * 0.12, 0, 1);
  const centerDetailLift = clamp(midDetailNeed * 0.38 + bassMask * 0.16 + vocalNeed * 0.10 + midDetailWindow * 0.08 - midDetailGuard * 0.28, 0, 1);
  const highAverage = (harsh + edgeBand + glassCoreBand + grainBand + splashBand + sheenBand + chirpBand + fizzBand) / 8;
  const midHighAverage = (presenceBand + tickleBand + harsh + edgeBand + glassCoreBand + grainBand) / 6;
  const highSpread = Math.max(
    Math.abs(harsh - highAverage),
    Math.abs(edgeBand - highAverage),
    Math.abs(glassCoreBand - highAverage),
    Math.abs(grainBand - highAverage),
    Math.abs(splashBand - highAverage),
    Math.abs(sheenBand - highAverage),
    Math.abs(chirpBand - highAverage),
    Math.abs(fizzBand - highAverage)
  );
  const aiHighTexture = clamp((aiHighCrest * 0.66 + highSpread * 0.38 - 0.20) / 0.88, 0, 1);
  const aiPresence = clamp((presenceBand * 0.36 + aiPresenceCrest * 0.46 + Math.max(0, presenceBand - midHighAverage * 1.30) * 0.62 - vocal * 0.15 - 0.40) / 0.64, 0, 1);
  const aiTickle = clamp((tickleBand * 0.42 + aiTickleCrest * 0.52 + Math.max(0, tickleBand - midHighAverage * 1.24) * 0.68 - vocal * 0.10 - 0.38) / 0.66, 0, 1);
  const aiHarsh = clamp((harsh * 0.44 + aiHarshCrest * 0.48 + aiHighTexture * 0.10 - 0.42) / 0.68, 0, 1);
  const aiEdge = clamp((edgeBand * 0.46 + aiEdgeCrest * 0.56 + Math.max(0, edgeBand - highAverage * 1.18) * 0.58 + aiHighTexture * 0.12 - 0.36) / 0.72, 0, 1);
  const aiGlass = clamp((glassCoreBand * 0.50 + aiGlassCrest * 0.62 + Math.max(0, glassCoreBand - highAverage * 1.16) * 0.62 + aiHighTexture * 0.14 - 0.34) / 0.72, 0, 1);
  const aiGrain = clamp((grainBand * 0.46 + aiGrainCrest * 0.54 + Math.max(0, grainBand - highAverage * 1.20) * 0.54 + aiHighTexture * 0.13 - 0.36) / 0.74, 0, 1);
  const aiSplash = clamp((splashBand * 0.64 + aiSplashCrest * 0.58 + aiHighTexture * 0.16 - highAverage * 0.18 - 0.26) / 0.72, 0, 1);
  const aiChirp = clamp((chirpBand * 0.76 + aiChirpCrest * 0.70 + aiHighTexture * 0.24 - highAverage * 0.18 - 0.22) / 0.72, 0, 1);
  const aiFizz = clamp((fizzBand * 0.54 + aiFizzCrest * 0.48 + aiHighTexture * 0.16 - 0.38) / 0.76, 0, 1);
  const sixEightAverage = (edgeBand + glassCoreBand) * 0.5;
  const sixEightDelta = Math.abs(edgeBand - glassCoreBand);
  const sixEightCrest = Math.max(aiEdgeCrest, aiGlassCrest);
  const aiEdgeSweetness = clamp((sixEightAverage * 0.82 + tickleReady * 0.24 + vocal * 0.08 - sixEightCrest * 0.26 - sixEightDelta * 0.72 - aiHighTexture * 0.18 - 0.08) / 0.72, 0, 1);
  const aiSixEightArtifact = clamp(Math.max(aiEdge, aiGlass) * (0.64 + aiHighTexture * 0.34) + sixEightCrest * 0.26 + sixEightDelta * 0.28 - aiEdgeSweetness * 0.24, 0, 1);
  const sevenTenAverage = (glassCoreBand + grainBand + splashBand) / 3;
  const sevenTenCrest = Math.max(aiGlassCrest * 0.88, aiGrainCrest, aiSplashCrest * 0.92);
  const aiSevenTenArtifact = clamp((sevenTenAverage * 0.42 + grainBand * 0.28 + splashBand * 0.24 + sevenTenCrest * 0.48 + aiHighTexture * 0.18 - highAverage * 0.16 - aiEdgeSweetness * 0.22 - 0.30) / 0.72, 0, 1);
  const sixTwelveAverage = (edgeBand + glassCoreBand + grainBand + splashBand + sheenBand) / 5;
  const sixTwelveCrest = Math.max(aiEdgeCrest * 0.82, aiGlassCrest, aiGrainCrest, aiSplashCrest, aiSheenCrest * 0.94);
  const sixTwelveSkew = Math.max(
    Math.abs(edgeBand - sixTwelveAverage),
    Math.abs(glassCoreBand - sixTwelveAverage),
    Math.abs(grainBand - sixTwelveAverage),
    Math.abs(splashBand - sixTwelveAverage),
    Math.abs(sheenBand - sixTwelveAverage)
  );
  const aiSixTwelveArtifact = clamp((sixTwelveAverage * 0.40 + sevenTenAverage * 0.22 + sheenBand * 0.18 + sixTwelveCrest * 0.50 + sixTwelveSkew * 0.30 + aiHighTexture * 0.20 - highAverage * 0.14 - aiEdgeSweetness * 0.20 - 0.28) / 0.74, 0, 1);
  // v0.3.74 Open Tickle + Sheen burst map. These values are intentionally
  // more transient-sensitive than the macro tonal guards. They help the engine
  // react like a tiny split-band de-esser: fast on S/edge/glass/splash/chirp,
  // slow enough to keep the high-end alive and not dull.
  const highSpikeDensity = clamp((
    aiHighCrest * 0.34
      + aiHighTexture * 0.26
      + sixTwelveCrest * 0.34
      + sixTwelveSkew * 0.18
      + Math.max(aiEdgeCrest, aiGlassCrest, aiGrainCrest, aiSplashCrest) * 0.24
      - aiEdgeSweetness * 0.18
      - 0.20
  ) / 0.92, 0, 1);
  const sibilanceBurst = clamp((aiHarsh * 0.28 + aiEdge * 0.36 + aiEdgeCrest * 0.46 + sixEightAverage * 0.22 + highSpikeDensity * 0.18 - aiEdgeSweetness * 0.20 - 0.20) / 0.78, 0, 1);
  const glassBurst = clamp((aiGlass * 0.46 + aiGrain * 0.20 + aiGlassCrest * 0.48 + sixEightDelta * 0.20 + highSpikeDensity * 0.20 - aiEdgeSweetness * 0.18 - 0.18) / 0.78, 0, 1);
  const splashBurst = clamp((aiGrain * 0.24 + aiSplash * 0.54 + aiSplashCrest * 0.48 + sevenTenCrest * 0.18 + highSpikeDensity * 0.20 - highAverage * 0.08 - 0.18) / 0.82, 0, 1);
  const chirpBurst = clamp((aiChirp * 0.60 + aiSheenCrest * 0.24 + aiChirpCrest * 0.46 + sheenBand * 0.20 + highSpikeDensity * 0.18 - 0.16) / 0.86, 0, 1);
  const aiSourceNaturalness = clamp(1 - Math.max(aiSixTwelveArtifact * 0.78, aiSevenTenArtifact * 0.64, aiChirp * 0.80, aiSplash * 0.54, aiFizz * 0.34, aiHighTexture * 0.36, highSpikeDensity * 0.34) + aiEdgeSweetness * 0.16, 0, 1);
  const airCrest = Math.max(spectralCrest(9800, 13200), spectralCrest(13200, 18000) * 0.82);
  const airStability = clamp(1 - Math.max(aiSixTwelveArtifact * 0.92, aiSevenTenArtifact * 0.76, aiSplash, aiChirp * 1.15, aiFizz * 0.70, aiHighTexture * 0.48, highSpikeDensity * 0.46), 0, 1);
  const sheenParticleWindow = clamp(airStability * 0.58 + aiSourceNaturalness * 0.22 + aiEdgeSweetness * 0.18 + Math.max(0, airBand - highAverage * 0.58) * 0.08 - Math.max(sibilanceBurst * 0.36, glassBurst * 0.42, splashBurst * 0.52, chirpBurst * 0.62), 0, 1);
  const polishedTrebleWindow = clamp(sheenParticleWindow * 0.68 + aiEdgeSweetness * 0.24 + tickleReady * 0.16 - highSpikeDensity * 0.18 - aiSixTwelveArtifact * 0.11, 0, 1);
  const godParticleAir = clamp((airBand * 0.56 + aiEdgeSweetness * 0.18 + tickleReady * 0.16 + sheenParticleWindow * 0.38 + aiSourceNaturalness * 0.12 - airCrest * 0.11 - Math.max(aiSixTwelveArtifact * 0.55, aiSevenTenArtifact * 0.44, splashBurst * 0.52, chirpBurst * 0.62, highSpikeDensity * 0.34) * 0.34 - 0.07) / 0.78, 0, 1);
  const godParticleMid = clamp((vocalMemoryBand * 0.34 + vocalTickleBand * 0.18 + tickleReady * 0.22 + vocalNeed * 0.12 + bassMask * 0.12 - vocalPresenceBadResonance * 0.28 - harshGuard * 0.18 - resonanceGuard * 0.18 - 0.10) / 0.62, 0, 1);
  const godParticleBass = clamp((bassTransient * 0.42 + bassPunchCrest * 0.30 + bassMask * 0.12 + kickFund * 0.10 - subPressure * 0.24 - bassFatigueGuard * 0.34 - 0.10) / 0.70, 0, 1);
  const godParticleGuard = clamp(Math.max(aiChirp * 0.96, aiSixTwelveArtifact * 0.92, aiSevenTenArtifact * 0.76, aiSplash * 0.76, aiFizz * 0.54, aiSixEightArtifact * 0.46, harshGuard * 0.28, resonanceGuard * 0.22), 0, 1);
  const godParticleSourceHz = clamp(weightedFreq(7600, 10400, 8600), 7800, 10400);
  const godParticlePresenceHz = clamp(weightedFreq(1780, 2320, 2050), 1860, 2220);
  const godParticleMidHz = clamp(weightedFreq(2600, 4800, 3300), 2600, 4600);
  const godParticleAirHz = clamp(weightedFreq(11800, 16800, 13200), 12000, 16000);
  const godParticleToneHz = clamp(weightedFreq(13200, 18000, 15200), 13600, 17600);

  const musicalRelaxGuard = clamp(
    bassFatigueGuard * 0.30
      + midProjectionGuard * 0.18
      + midDetailGuard * 0.10
      + midPaperGuard * 0.12
      + resonanceGuard * 0.28
      + harshGuard * 0.16
      + aiSixTwelveArtifact * 0.16
      + subGovernor * 0.10,
    0,
    1
  );

  // v0.3.74 ArSonKuPik Open Dopamine map: preserve body/tickle/presence but do
  // not turn any single vocal partial into an obvious resonance. These are broad musical sweet
  // zones, with the resonance guard reducing boost when the source is already
  // narrow/peaky.
  return {
    lowMidGlue: clamp(1.00 + lowMidNeed * 0.060 + bodyNeed * 0.055 - bodyHeavy * 0.070 - mudGuard * 0.050 - resonanceGuard * 0.055, 0.90, 1.12),
    lowBodyBoost: clamp(1.00 + bodyNeed * 0.115 + vocalNeed * 0.030 - mudGuard * 0.150 - bodyHeavy * 0.070 - resonanceGuard * 0.115, 0.88, 1.13),
    smartBass: clamp(1.00 + bassMotion * 0.045 + glerrrTorque * 0.020 - bassFatigueGuard * 0.060 - subGovernor * 0.028, 0.90, 1.06),
    bassPunchBoost: clamp(1.00 + punchBreather * 0.115 + bassMotion * 0.030 - bassFatigueGuard * 0.055 - subGovernor * 0.040, 0.88, 1.13),
    bassPunchHz,
    bassTorqueHz,
    bassTransient: clamp(bassTransient, 0, 1),
    bassMotion: clamp(bassMotion, 0, 1),
    bassBreathing: clamp(bassBreathing, 0, 1),
    subGovernor: clamp(subGovernor, 0, 1),
    glerrrTorque: clamp(glerrrTorque, 0, 1),
    bassTorqueKeeper: clamp(glerrrTorque, 0, 1),
    punchBreather: clamp(punchBreather, 0, 1),
    warmBodyAuto: clamp(warmBodyAuto, 0, 1),
    midlowSpaceGuard: clamp(midlowSpaceGuard, 0, 1),
    psychoBassRelief: clamp(psychoBassRelief, 0, 1),
    lowEndPocket: clamp(lowEndPocket, 0.84, 1.16),
    subBassSmile: clamp(subBassSmile, 0, 1),
    bassGrooveLift: clamp(bassGrooveLift, 0, 1),
    bassDensityGuard: clamp(bassDensityGuard, 0, 1),
    midlowUnmask: clamp(midlowUnmask, 0, 1),
    vocalPocketOpen: clamp(vocalPocketOpen, 0, 1),
    lowEndAirSpace: clamp(lowEndAirSpace, 0.82, 1.08),
    bassSustainGuard: clamp(Math.max(bassSustainGuard, bassSustainCrest * 0.16 - 0.05), 0, 1),
    bassFatigueGuard: clamp(bassFatigueGuard, 0, 1),
    bassWarmthGuard: clamp(bassWarmthGuard, 0, 1),
    subPressure: clamp(subPressure, 0, 1),
    vocalBodyGuard: clamp(1.00 + bodyNeed * 0.075 + vocalNeed * 0.030 + lowMidNeed * 0.025 - mudGuard * 0.105 - bodyHeavy * 0.045 - resonanceGuard * 0.095, 0.90, 1.14),
    vocalBodyEqHz: clamp(490 + bodyNeed * 8 - mudGuard * 18 - resonanceGuard * 8, 465, 505),
    vocalPresenceBoost: clamp(1.00 + vocalPresenceNeed * 0.165 + bassMask * 0.070 + vocalNeed * 0.035 - vocalPresenceBadResonance * 0.220 - resonanceGuard * 0.080, 0.84, 1.20),
    vocalPresenceHz: clamp(weightedFreq(1780, 2320, 2050), 1860, 2220),
    vocalPresenceGuard: clamp(Math.max(vocalPresenceBadResonance, resonanceGuard * 0.32), 0, 1),
    vocalPresenceGuardHz: clamp(weightedFreq(2350, 2850, 2550), 2380, 2780),
    vocalTickleBoost: clamp(1.00 + vocalTickleNeed * 0.145 + bassMask * 0.060 + vocalNeed * 0.025 - vocalTickleBadResonance * 0.210 - resonanceGuard * 0.090, 0.84, 1.18),
    vocalTickleHz: clamp(weightedFreq(1030, 1280, 1150), 1070, 1235),
    vocalTickleGuard: clamp(Math.max(vocalTickleBadResonance, resonanceGuard * 0.36), 0, 1),
    vocalTickleGuardHz: clamp(weightedFreq(1280, 1580, 1380), 1280, 1520),
    bassMask: clamp(bassMask, 0, 1),
    upperBodyBoost: clamp(1.00 + upperBodyNeed * 0.105 + vocalNeed * 0.030 - upperBodyBadResonance * 0.170 - mudGuard * 0.060 - resonanceGuard * 0.080, 0.86, 1.13),
    upperBodyHz: clamp(600 + upperBodyNeed * 16 - upperBodyBadResonance * 28 - resonanceGuard * 8, 555, 635),
    upperBodyGuard: clamp(Math.max(upperBodyBadResonance, resonanceGuard * 0.46), 0, 1),
    upperBodyHonkHz: clamp(weightedFreq(650, 980, 780), 680, 920),
    mudGuard: clamp(Math.max(mudGuard, resonanceGuard * 0.72), 0, 1),
    lowBodyHz: clamp(238 + bodyNeed * 22 - mudGuard * 12, 225, 275),
    mudGuardHz: clamp(weightedFreq(330, 520, 385), 350, 465),
    anchorExcite: clamp(1.00 + vocalNeed * 0.090 + centerNeed * 0.055 - harshGuard * 0.130 - resonanceGuard * 0.135, 0.84, 1.12),
    sideExcite: clamp(1.00 + tickleReady * 0.095 + vocalNeed * 0.030 - harshGuard * 0.255 - resonanceGuard * 0.210, 0.70, 1.11),
    harshGuard: clamp(Math.max(harshGuard, resonanceGuard * 0.42), 0, 1),
    resonanceGuard,
    musicalRelaxGuard,
    anchorLowHz: clamp(680 + bodyHeavy * 45 - lowMidNeed * 35, 620, 760),
    anchorFocusHz: clamp(1840 + vocalNeed * 170 - harshGuard * 80, 1700, 2220),
    anchorToneHz: clamp(2950 + tickleReady * 140 - harshGuard * 190, 2700, 3300),
    sideFocusHz: clamp(2300 + tickleReady * 120 - resonanceGuard * 110, 2100, 2600),
    tickleToneHz: clamp(3450 + tickleReady * 210 - harshGuard * 260 - resonanceGuard * 180, 3150, 3800),
    midProjectionBoost: clamp(1.00 + midProjectionNeed * 0.185 + bassMask * 0.085 + vocalNeed * 0.040 - midProjectionGuard * 0.220 - resonanceGuard * 0.075, 0.82, 1.22),
    midProjectionGuard: clamp(midProjectionGuard, 0, 1),
    midNasalGuard: clamp(midNasalGuard, 0, 1),
    midShoutGuard: clamp(midShoutGuard, 0, 1),
    midProjectionHz: clamp(weightedFreq(1600, 2350, 2050), 1650, 2320),
    midProjectionBodyHz: clamp(390 + bodyNeed * 24 - mudGuard * 18 + lowMidNeed * 8, 340, 460),
    midNasalHz: clamp(weightedFreq(820, 1180, 980), 860, 1120),
    midShoutHz: clamp(weightedFreq(3150, 4300, 3600), 3200, 4200),
    midProjectionSideTuckHz: clamp(weightedFreq(1450, 2350, 1850), 1550, 2200),
    midDetailNeed: clamp(midDetailNeed, 0, 1),
    midDetailWindow: clamp(midDetailWindow, 0, 1),
    midDetailBoost: clamp(1.00 + midDetailNeed * 0.125 + centerDetailLift * 0.060 - midDetailGuard * 0.145, 0.86, 1.15),
    midDetailGuard: clamp(midDetailGuard, 0, 1),
    midCreamBoost: clamp(1.00 + midCreamNeed * 0.110 + centerDetailLift * 0.035 - mudGuard * 0.090 - midFormantGuard * 0.060, 0.88, 1.13),
    midCreamHz: clamp(weightedFreq(420, 700, 560), 470, 640),
    midFormantGuard: clamp(midFormantGuard, 0, 1),
    midFormantHz: clamp(weightedFreq(650, 950, 820), 690, 910),
    midIntelligibilityBoost: clamp(1.00 + midIntelligibilityNeed * 0.115 + midDetailNeed * 0.035 - midIntelligibilityGuard * 0.150 - midShoutBurst * 0.085, 0.86, 1.14),
    midIntelligibilityHz: clamp(weightedFreq(2350, 2900, 2600), 2380, 2860),
    midIntelligibilityGuard: clamp(midIntelligibilityGuard, 0, 1),
    midPaperGuard: clamp(midPaperGuard, 0, 1),
    midPaperHz: clamp(weightedFreq(3800, 5200, 4400), 3900, 5050),
    midShoutBurst: clamp(midShoutBurst, 0, 1),
    midPaperBurst: clamp(midPaperBurst, 0, 1),
    centerDetailLift: clamp(centerDetailLift, 0, 1),
    midDetailDensity: clamp(midDetailDensity, 0, 1),
    aiPresence: clamp(aiPresence, 0, 1),
    aiTickle: clamp(aiTickle, 0, 1),
    aiHarsh: clamp(aiHarsh, 0, 1),
    aiEdge: clamp(aiEdge, 0, 1),
    aiGlass: clamp(aiGlass, 0, 1),
    aiGrain: clamp(aiGrain, 0, 1),
    aiSixEightArtifact: clamp(aiSixEightArtifact, 0, 1),
    aiSevenTenArtifact: clamp(aiSevenTenArtifact, 0, 1),
    aiSixTwelveArtifact: clamp(aiSixTwelveArtifact, 0, 1),
    aiSourceNaturalness: clamp(aiSourceNaturalness, 0, 1),
    aiEdgeSweetness: clamp(aiEdgeSweetness, 0, 1),
    aiSplash: clamp(aiSplash, 0, 1),
    aiChirp: clamp(aiChirp, 0, 1),
    aiFizz: clamp(aiFizz, 0, 1),
    aiHighCrest: clamp(aiHighCrest, 0, 1),
    aiHighTexture: clamp(aiHighTexture, 0, 1),
    highSpikeDensity: clamp(highSpikeDensity, 0, 1),
    sibilanceBurst: clamp(sibilanceBurst, 0, 1),
    glassBurst: clamp(glassBurst, 0, 1),
    splashBurst: clamp(splashBurst, 0, 1),
    chirpBurst: clamp(chirpBurst, 0, 1),
    sheenParticleWindow: clamp(sheenParticleWindow, 0, 1),
    polishedTrebleWindow: clamp(polishedTrebleWindow, 0, 1),
    trebleClaritySkinHz: clamp(weightedFreq(8200, 9300, 8750), 8300, 9200),
    treblePhaseRisk: 0,
    velvetTrebleWindow: clamp(polishedTrebleWindow * 0.55 + airStability * 0.34 + aiEdgeSweetness * 0.18 + aiSourceNaturalness * 0.10 - aiHighTexture * 0.14 - aiSixTwelveArtifact * 0.18, 0, 1),
    roundedTrebleNeed: clamp(Math.max(aiHarsh, aiEdge, aiGlass, aiGrain, aiSixTwelveArtifact * 1.12, aiSevenTenArtifact * 1.02, aiSplash * 0.84, aiChirp * 0.88, aiFizz * 0.58), 0, 1),
    godParticleAir: clamp(godParticleAir, 0, 1),
    godParticleMid: clamp(godParticleMid, 0, 1),
    godParticleBass: clamp(godParticleBass, 0, 1),
    godParticleStereo: clamp(0.86 + tickleReady * 0.22 - aiSixEightArtifact * 0.10 - resonanceGuard * 0.08, 0.68, 1.18),
    godParticleGuard: clamp(godParticleGuard, 0, 1),
    godParticleSourceHz,
    godParticleMidHz,
    godParticlePresenceHz,
    godParticleAirHz,
    godParticleToneHz,
    aiSilkSourceHz: clamp(weightedFreq(3150, 5600, 4300), 3300, 5800),
    aiSilkAirHz: clamp(weightedFreq(11400, 16200, 13200) + aiSixTwelveArtifact * 420 + sheenParticleWindow * 180, 11200, 16000),
    aiPresenceHz: clamp(weightedFreq(1500, 3000, 2300), 1700, 2900),
    aiTickleHz: clamp(weightedFreq(3000, 5200, 4200), 3300, 5000),
    aiHarshHz: clamp(weightedFreq(5200, 6100, 5600), 5200, 6200),
    aiEdgeHz: clamp(weightedFreq(5900, 6700, 6250), 5900, 6700),
    aiGlassHz: clamp(weightedFreq(6600, 7500, 7050), 6600, 7500),
    aiGrainHz: clamp(weightedFreq(7400, 8500, 7850), 7400, 8500),
    aiEdgeSourceHz: clamp(weightedFreq(4400, 5700, 5000), 4400, 5700),
    aiEdgePleasantHz: clamp(weightedFreq(6500, 7800, 7050), 6500, 7800),
    aiSplashHz: clamp(weightedFreq(8400, 10200, 8800), 8400, 10200),
    aiChirpHz: clamp(weightedFreq(10200, 14000, 11600), 10200, 14000),
    aiFizzHz: clamp(weightedFreq(14000, 18000, 14800), 13200, 17800)
  };
}


function makeLinearCurve() {
  const samples = 256;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    curve[i] = (i / (samples - 1)) * 2 - 1;
  }
  return curve;
}

function makeSaturationCurve(driveDb = 3, mode = 'clean') {
  const samples = 1024;
  const curve = new Float32Array(samples);
  const drive = dbToGain(Math.min(12, Math.max(0, driveDb)));
  const asym = mode === 'warm' ? 0.13 : mode === 'mastering' ? 0.052 : mode === 'modern' ? 0.060 : 0.075;
  const hardness = mode === 'mastering' ? 0.56 : mode === 'modern' ? 0.62 : mode === 'warm' ? 0.54 : 0.48;
  const norm = Math.tanh(drive * hardness * (1 + asym)) || 1;
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1;
    const d = x * drive;
    const biased = d >= 0 ? d * (1 + asym) : d * (1 - asym);
    const shaped = Math.tanh(biased * hardness) / norm;
    curve[i] = clamp(shaped * 0.82 + x * 0.18, -0.98, 0.98);
  }
  return curve;
}

function makeBassExciterCurve(driveDb = 3, mode = 'clean') {
  const samples = 1024;
  const curve = new Float32Array(samples);
  const drive = dbToGain(Math.min(9, Math.max(0, driveDb)));
  const warmth = mode === 'warm' ? 0.115 : mode === 'mastering' ? 0.050 : mode === 'modern' ? 0.058 : 0.070;
  const hardness = mode === 'mastering' ? 0.46 : mode === 'modern' ? 0.50 : mode === 'warm' ? 0.43 : 0.45;
  const norm = Math.tanh(drive * hardness + warmth) || 1;
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1;
    const even = warmth * (x * x - 0.3333333);
    const shaped = Math.tanh((x * drive + even) * hardness) / norm;
    // Preserve transient and fundamental; wet EQ supplies weight, curve supplies harmonic audibility.
    curve[i] = clamp(shaped * 0.46 + x * 0.54, -0.98, 0.98);
  }
  return curve;
}

function makeAnalogWarmCurve(driveDb = 3, mode = 'warm') {
  const samples = 1024;
  const curve = new Float32Array(samples);
  const drive = dbToGain(Math.min(10, Math.max(0, driveDb)));
  const even = mode === 'warm' ? 0.105 : mode === 'mastering' ? 0.060 : mode === 'modern' ? 0.068 : 0.078;
  const third = mode === 'mastering' ? 0.027 : mode === 'modern' ? 0.035 : 0.022;
  const hardness = mode === 'warm' ? 0.44 : mode === 'mastering' ? 0.46 : mode === 'modern' ? 0.50 : 0.40;
  const norm = Math.tanh(drive * hardness + even) || 1;
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1;
    const analog = x * drive + even * (x * x - 0.3333333) + third * x * x * x;
    const shaped = Math.tanh(analog * hardness) / norm;
    curve[i] = clamp(shaped * 0.64 + x * 0.36, -0.97, 0.97);
  }
  return curve;
}

function makePresenceExciterCurve(driveDb = 3, mode = 'clean') {
  const samples = 1024;
  const curve = new Float32Array(samples);
  const drive = dbToGain(Math.min(9, Math.max(0, driveDb)));
  const hardness = mode === 'mastering' ? 0.36 : mode === 'modern' ? 0.40 : mode === 'warm' ? 0.34 : 0.36;
  const even = mode === 'warm' ? 0.046 : mode === 'mastering' ? 0.034 : 0.030;
  const norm = Math.tanh(drive * hardness) || 1;
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1;
    const shaped = Math.tanh((x * drive + even * (x * x - 0.3333333)) * hardness) / norm;
    curve[i] = clamp(shaped * 0.44 + x * 0.56, -0.965, 0.965);
  }
  return curve;
}

function makeAirExciterCurve(driveDb = 3, mode = 'clean') {
  const samples = 1024;
  const curve = new Float32Array(samples);
  const drive = dbToGain(Math.min(8, Math.max(0, driveDb)));
  const hardness = mode === 'mastering' ? 0.22 : mode === 'modern' ? 0.24 : mode === 'warm' ? 0.21 : 0.20;
  const even = mode === 'mastering' ? 0.014 : mode === 'modern' ? 0.012 : 0.017;
  const odd = mode === 'mastering' ? 0.038 : mode === 'modern' ? 0.044 : 0.034;
  const norm = Math.tanh(drive * hardness) || 1;
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1;
    const soft = Math.tanh(x * drive * hardness) / norm;
    const shimmer = even * (x * x - 0.3333333) + odd * x * x * x;
    curve[i] = clamp(soft * 0.16 + x * 0.80 + shimmer, -0.92, 0.92);
  }
  return curve;
}

function makeMidAnchorCurve(driveDb = 2.5, mode = 'modern') {
  const samples = 1024;
  const curve = new Float32Array(samples);
  const drive = dbToGain(Math.min(6.2, Math.max(0, driveDb)));
  const even = mode === 'warm' ? 0.074 : mode === 'mastering' ? 0.058 : mode === 'modern' ? 0.052 : 0.040;
  const third = mode === 'mastering' ? 0.015 : mode === 'modern' ? 0.018 : 0.012;
  const hardness = mode === 'mastering' ? 0.30 : mode === 'modern' ? 0.32 : mode === 'warm' ? 0.28 : 0.25;
  const norm = Math.tanh(drive * hardness + even) || 1;
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1;
    const shaped = Math.tanh((x * drive + even * (x * x - 0.3333333) + third * x * x * x) * hardness) / norm;
    // Mostly clean pass-through with a little even-harmonic sweetness. This is
    // the center support layer, not distortion.
    curve[i] = clamp(shaped * 0.32 + x * 0.68, -0.96, 0.96);
  }
  return curve;
}

function makeSideAirExciterCurve(driveDb = 3, mode = 'modern') {
  const samples = 1024;
  const curve = new Float32Array(samples);
  const drive = dbToGain(Math.min(7, Math.max(0, driveDb)));
  const hardness = mode === 'mastering' ? 0.19 : mode === 'modern' ? 0.20 : mode === 'warm' ? 0.18 : 0.17;
  const odd = mode === 'mastering' ? 0.024 : mode === 'modern' ? 0.027 : 0.022;
  const even = mode === 'warm' ? 0.009 : mode === 'mastering' ? 0.007 : 0.006;
  const norm = Math.tanh(drive * hardness) || 1;
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1;
    const soft = Math.tanh((x * drive + even * (x * x - 0.3333333)) * hardness) / norm;
    const shimmer = odd * x * x * x;
    curve[i] = clamp(soft * 0.14 + x * 0.82 + shimmer, -0.90, 0.90);
  }
  return curve;
}

function makeSoftClipCurve(amount = 0.94) {
  const samples = 1024;
  const curve = new Float32Array(samples);
  const knee = Math.min(0.98, Math.max(0.72, amount));
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1;
    const ax = Math.abs(x);
    if (ax <= knee) {
      curve[i] = x;
    } else {
      const sign = x < 0 ? -1 : 1;
      const over = (ax - knee) / (1 - knee);
      const shaped = knee + (1 - knee) * Math.tanh(over * 1.55) / Math.tanh(1.55);
      curve[i] = sign * Math.min(0.995, shaped);
    }
  }
  return curve;
}

function deepMerge(target, patch) {
  if (!patch || typeof patch !== 'object') return target;
  if (Array.isArray(patch)) return patch;
  const output = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (Array.isArray(value)) {
      output[key] = value.map((item, index) => (typeof item === 'object' ? { ...item, id: item.id || `band-${index}` } : item));
    } else if (value && typeof value === 'object') {
      output[key] = deepMerge(target?.[key] || {}, value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function linearToDb(value) { return 20 * Math.log10(Math.max(value, 1e-12)); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function clamp01(value) { return clamp(Number.isFinite(value) ? value : 0, 0, 1); }
