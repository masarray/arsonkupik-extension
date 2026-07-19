export const EQ_TYPE_LABELS = {
  lowcut: 'Low cut',
  lowshelf: 'Low shelf',
  bell: 'Bell',
  notch: 'Notch',
  highshelf: 'High shelf',
  highcut: 'High cut'
};

export const WEB_AUDIO_TYPE = {
  lowcut: 'highpass',
  lowshelf: 'lowshelf',
  bell: 'peaking',
  notch: 'notch',
  highshelf: 'highshelf',
  highcut: 'lowpass'
};

export const VOCAL_ACOUSTIC_BODY_BAND = {
  id: 'vocal-acoustic-body',
  label: 'Vocal / Guitar Body',
  type: 'bell',
  frequency: 170,
  gain: 0.9,
  q: 2.5,
  slope: 12,
  enabled: true
};

export const VOCAL_BODY_GUARD_BAND = {
  id: 'vocal-body-490',
  label: 'Vocal Body Guard',
  type: 'bell',
  frequency: 490,
  gain: 1.5,
  q: 0.8,
  slope: 12,
  enabled: true
};

export const DEFAULT_EQ_BANDS = [
  { id: 'cut-low', label: 'Sub Clean', type: 'lowcut', frequency: 25, gain: 0, q: 0.707, slope: 24, enabled: true },
  { id: 'low-body', label: 'Deep Glerr Body', type: 'lowshelf', frequency: 76, gain: 1.30, q: 0.64, slope: 12, enabled: true },
  { id: 'mud-clean', label: 'Vocal Pocket Clean', type: 'bell', frequency: 325, gain: -1.32, q: 0.86, slope: 12, enabled: true },
  { id: 'presence', label: 'Global Mid Detail', type: 'bell', frequency: 2180, gain: 1.16, q: 0.64, slope: 12, enabled: true },
  { id: 'detail', label: 'Semarak Mid-High Tickle', type: 'bell', frequency: 6250, gain: 1.60, q: 0.52, slope: 12, enabled: true },
  { id: 'sparkle', label: 'Open Stereo Air Particles', type: 'highshelf', frequency: 12650, gain: 4.38, q: 0.38, slope: 12, enabled: true },
  // Support bands are appended to preserve historical preset indexes.
  // normalizeEqBands() places them by frequency in the live chain.
  VOCAL_ACOUSTIC_BODY_BAND,
  VOCAL_BODY_GUARD_BAND
];

export const DEFAULT_COMPRESSOR = {
  threshold: -24.4,
  ratio: 1.7,
  knee: 24,
  attack: 0.032,
  release: 0.21,
  makeupGain: 0.88,
  parallelMix: 92,
  enabled: true
};

export const DEFAULT_COLOR = {
  enabled: true,
  drive: 3.12,
  // ArSonKuPik Vocal Pocket DNA: keep the enjoyable dopamine energy,
  // but place low-end behind the vocal so words/snare/guitar stay clear.
  bodyFreq: 166,
  body: 12.8,
  smartBass: 55,
  warmthFreq: 500,
  harmonics: 34,
  harmonicsFreq: 2180,
  warmth: 12.8,
  airFreq: 12650,
  air: 48.8,
  aiHighRepair: 46,
  // More velvet than shine: 6–12 kHz is rounded first, then clean air is rebuilt.
  velvetTreble: 66,
  // Smaller particles, smoother dopamine. Enough excitement, less long-term fatigue.
  godParticles: 92.0,
  vocalTickle: 67,
  // Center memory remains alive, but the default avoids over-forward 2 kHz push.
  vocalPresence: 55,
  // Mid projection stays musical and thick, not shouty or radio-pushed.
  midProjection: 65,
  mix: 30.5,
  stereoMid: 70,
  mode: 'mastering'
};

export const DEFAULT_WIDTH = {
  enabled: true,
  mix: 73,
  width: 153,
  lowWidth: 100,
  lowMidWidth: 101,
  midWidth: 128,
  highWidth: 200,
  sourceProtect: 56,
  monoBass: true,
  monoBassFreq: 150,
  sideTone: 4.28
};

export const DEFAULT_OUTPUT = {
  inputGain: 0,
  outputGain: -0.55,
  limiterEnabled: true,
  limiterCeiling: -1.05,
  limiterDrive: 0.76,
  punchProtect: true,
  bypass: false
};

export const DEFAULT_MASTER_REVISION = 'v0-3-96-treble-coherence-skin-engine';

export const PRIMARY_MASTER_PRESET_IDS = [
  'mastering',
  'default',
  'dangdut-mantap',
  'kpop-nikmat',
  'hard-rock',
  'blues-asik',
  'pop-indonesia',
  'edm-santai',
  'jazz-hangat',
  'akustik-intim',
  'max-enhancer',
  'sonkuhoreg',
  'sonkubattle',
  'sonkubalap',
  'audiophile-pop',
  'pro-music',
  'open-air-field',
  'movie-dolby',
  'podcast',
  'night-listening'
];

function p({ id, name, description, eq = DEFAULT_EQ_BANDS, compressor = {}, color = {}, width = {}, output = {} }) {
  return {
    id,
    name,
    description,
    eq,
    compressor: { ...DEFAULT_COMPRESSOR, ...compressor },
    color: { ...DEFAULT_COLOR, ...color },
    width: { ...DEFAULT_WIDTH, ...width },
    output: { ...DEFAULT_OUTPUT, ...output }
  };
}

export const FACTORY_PRESETS = [
  p({
    id: 'mastering',
    name: 'Mastering Global',
    description: 'Global-smart mastering preset: living mid, glerr deep bass pocket, open stereo sheen, velvet treble, and long-repeat tonal balance.',
    eq: [
      { id: 'master-sub-clean', label: 'Sub Clean', type: 'lowcut', frequency: 26, gain: 0, q: 0.707, slope: 24, enabled: true },
      { id: 'master-weight', label: 'Global Glerr Body', type: 'lowshelf', frequency: 82, gain: 1.18, q: 0.68, slope: 12, enabled: true },
      { ...VOCAL_ACOUSTIC_BODY_BAND, gain: 0.98, q: 2.45 },
      { id: 'master-mud-control', label: 'Mud Clean', type: 'bell', frequency: 345, gain: -0.66, q: 0.86, slope: 12, enabled: true },
      { ...VOCAL_BODY_GUARD_BAND, gain: 1.46, q: 0.80 },
      { id: 'master-vocal-forward', label: 'Living Mid', type: 'bell', frequency: 2050, gain: 0.88, q: 0.70, slope: 12, enabled: true },
      { id: 'master-harsh-polish', label: 'Harsh Polish', type: 'bell', frequency: 4050, gain: -0.16, q: 1.04, slope: 12, enabled: true },
      { id: 'master-detail', label: 'Open Sheen Detail', type: 'bell', frequency: 6500, gain: 0.98, q: 0.84, slope: 12, enabled: true },
      { id: 'master-treble-skin', label: 'Treble Clarity Skin', type: 'bell', frequency: 8750, gain: 0.38, q: 1.04, slope: 12, enabled: true },
      { id: 'master-air', label: 'Open Rounded Sheen', type: 'highshelf', frequency: 12650, gain: 2.86, q: 0.42, slope: 12, enabled: true }
    ],
    compressor: { threshold: -24.2, ratio: 1.62, knee: 26, attack: 0.036, release: 0.225, makeupGain: 0.64, parallelMix: 91 },
    color: {
      enabled: true,
      drive: 3.05,
      bodyFreq: 166,
      body: 14.2,
      smartBass: 58,
      warmthFreq: 500,
      warmth: 12.7,
      harmonicsFreq: 2080,
      harmonics: 31,
      airFreq: 12650,
      air: 34.4,
      godParticles: 70.5,
      aiHighRepair: 50,
      velvetTreble: 72,
      vocalTickle: 50,
      vocalPresence: 48,
      midProjection: 56,
      mix: 26.2,
      stereoMid: 48,
      mode: 'mastering'
    },
    width: { enabled: true, mix: 64, width: 134, lowWidth: 100, lowMidWidth: 102, midWidth: 114, highWidth: 180, sourceProtect: 74, monoBass: true, monoBassFreq: 150, sideTone: 3.05 },
    output: { outputGain: -1.7, limiterDrive: 0.36, limiterCeiling: -1.05, punchProtect: true }
  }),
  p({
    id: 'default',
    name: 'Mas Ari Signature',
    description: 'Flagship Mas Ari signature: bass bulat bernapas, natural forward mid, refined stereo particles, velvet treble, and an enjoyable long-listening balance.',
    eq: DEFAULT_EQ_BANDS,
    compressor: DEFAULT_COMPRESSOR,
    color: DEFAULT_COLOR,
    width: DEFAULT_WIDTH,
    output: DEFAULT_OUTPUT
  }),
  p({
    id: 'dangdut-mantap',
    name: 'Dangdut Mantap',
    description: 'Mas Ari Signature tuned for dangdut: kendang punch, rounded bass, lively vocal, bright percussion, and slightly calmer output.',
    eq: [
      { ...DEFAULT_EQ_BANDS[0], frequency: 28 },
      { ...DEFAULT_EQ_BANDS[1], frequency: 82, gain: 1.55, q: 0.62 },
      { ...VOCAL_ACOUSTIC_BODY_BAND, frequency: 180, gain: 1.05, q: 2.2 },
      { ...DEFAULT_EQ_BANDS[2], frequency: 315, gain: -1.05, q: 0.82 },
      { ...VOCAL_BODY_GUARD_BAND, gain: 1.42, q: 0.82 },
      { ...DEFAULT_EQ_BANDS[3], frequency: 2250, gain: 1.18, q: 0.62 },
      { ...DEFAULT_EQ_BANDS[4], frequency: 6500, gain: 1.28, q: 0.56 },
      { ...DEFAULT_EQ_BANDS[5], frequency: 12650, gain: 3.05, q: 0.42 }
    ],
    compressor: { threshold: -24.8, ratio: 1.72, knee: 25, attack: 0.030, release: 0.20, makeupGain: 0.62, parallelMix: 90 },
    color: { drive: 3.0, body: 14.8, smartBass: 64, warmth: 13.2, harmonics: 32, air: 36, godParticles: 73, aiHighRepair: 52, velvetTreble: 74, vocalTickle: 58, vocalPresence: 58, midProjection: 60, mix: 27, stereoMid: 54 },
    width: { mix: 65, width: 138, lowMidWidth: 103, midWidth: 116, highWidth: 178, sourceProtect: 72, sideTone: 3.0 },
    output: { outputGain: -1.55, limiterDrive: 0.52, limiterCeiling: -1.1 }
  }),
  p({
    id: 'kpop-nikmat',
    name: 'K-Pop Nikmat',
    description: 'Clean modern K-pop polish with tight bass, glossy vocal detail, airy stereo sparkle, and controlled listening level.',
    eq: [
      { ...DEFAULT_EQ_BANDS[0], frequency: 30 },
      { ...DEFAULT_EQ_BANDS[1], frequency: 86, gain: 1.05, q: 0.68 },
      { ...DEFAULT_EQ_BANDS[2], frequency: 340, gain: -1.18, q: 0.88 },
      { ...VOCAL_BODY_GUARD_BAND, gain: 1.25, q: 0.82 },
      { ...DEFAULT_EQ_BANDS[3], frequency: 2480, gain: 1.34, q: 0.60 },
      { ...DEFAULT_EQ_BANDS[4], frequency: 6900, gain: 1.62, q: 0.54 },
      { ...DEFAULT_EQ_BANDS[5], frequency: 13000, gain: 3.55, q: 0.40 }
    ],
    compressor: { threshold: -25.0, ratio: 1.82, knee: 24, attack: 0.024, release: 0.18, makeupGain: 0.55, parallelMix: 89 },
    color: { drive: 2.95, body: 11.5, smartBass: 53, warmth: 10.5, harmonics: 35, air: 42, godParticles: 82, aiHighRepair: 60, velvetTreble: 80, vocalTickle: 64, vocalPresence: 60, midProjection: 62, mix: 27, stereoMid: 62 },
    width: { mix: 70, width: 145, lowMidWidth: 102, midWidth: 122, highWidth: 192, sourceProtect: 68, sideTone: 3.35 },
    output: { outputGain: -1.72, limiterDrive: 0.48, limiterCeiling: -1.1 }
  }),
  p({
    id: 'hard-rock',
    name: 'Hard Rock',
    description: 'Dense guitar energy, kick impact, snare bite, and strong vocal projection without excessive loudness or treble fatigue.',
    eq: [
      { ...DEFAULT_EQ_BANDS[0], frequency: 32 },
      { ...DEFAULT_EQ_BANDS[1], frequency: 92, gain: 1.18, q: 0.68 },
      { ...VOCAL_ACOUSTIC_BODY_BAND, frequency: 190, gain: 0.72, q: 2.0 },
      { ...DEFAULT_EQ_BANDS[2], frequency: 305, gain: -1.42, q: 0.86 },
      { ...VOCAL_BODY_GUARD_BAND, gain: 1.2, q: 0.84 },
      { ...DEFAULT_EQ_BANDS[3], frequency: 2450, gain: 1.48, q: 0.64 },
      { id: 'hard-rock-harsh-guard', label: 'Guitar Harsh Guard', type: 'bell', frequency: 4300, gain: -0.48, q: 1.0, slope: 12, enabled: true },
      { ...DEFAULT_EQ_BANDS[4], frequency: 6200, gain: 1.05, q: 0.62 },
      { ...DEFAULT_EQ_BANDS[5], frequency: 12400, gain: 2.45, q: 0.46 }
    ],
    compressor: { threshold: -25.0, ratio: 1.92, knee: 22, attack: 0.021, release: 0.16, makeupGain: 0.50, parallelMix: 86 },
    color: { drive: 3.25, body: 13.2, smartBass: 49, warmth: 12.0, harmonics: 41, air: 28, godParticles: 58, aiHighRepair: 48, velvetTreble: 72, vocalTickle: 50, vocalPresence: 62, midProjection: 70, mix: 25.5, stereoMid: 52 },
    width: { mix: 58, width: 130, lowMidWidth: 101, midWidth: 112, highWidth: 160, sourceProtect: 82, sideTone: 2.45 },
    output: { outputGain: -1.92, limiterDrive: 0.58, limiterCeiling: -1.15 }
  }),
  p({
    id: 'blues-asik',
    name: 'Blues Asik',
    description: 'Warm expressive blues tone with guitar body, intimate vocal texture, relaxed dynamics, and smooth non-fatiguing air.',
    eq: [
      { ...DEFAULT_EQ_BANDS[0], frequency: 30 },
      { ...DEFAULT_EQ_BANDS[1], frequency: 78, gain: 0.92, q: 0.70 },
      { ...VOCAL_ACOUSTIC_BODY_BAND, frequency: 168, gain: 1.28, q: 2.25 },
      { ...DEFAULT_EQ_BANDS[2], frequency: 330, gain: -0.58, q: 0.82 },
      { ...VOCAL_BODY_GUARD_BAND, gain: 1.62, q: 0.78 },
      { ...DEFAULT_EQ_BANDS[3], frequency: 1820, gain: 0.88, q: 0.70 },
      { ...DEFAULT_EQ_BANDS[4], frequency: 5900, gain: 0.62, q: 0.68 },
      { ...DEFAULT_EQ_BANDS[5], frequency: 12000, gain: 2.15, q: 0.48 }
    ],
    compressor: { threshold: -23.6, ratio: 1.55, knee: 28, attack: 0.046, release: 0.28, makeupGain: 0.48, parallelMix: 92 },
    color: { drive: 2.72, body: 14.5, smartBass: 43, warmth: 15.4, harmonics: 28, air: 25, godParticles: 52, aiHighRepair: 40, velvetTreble: 70, vocalTickle: 42, vocalPresence: 46, midProjection: 50, mix: 24.5, stereoMid: 38 },
    width: { mix: 54, width: 124, lowMidWidth: 102, midWidth: 108, highWidth: 148, sourceProtect: 86, sideTone: 2.05 },
    output: { outputGain: -1.82, limiterDrive: 0.40, limiterCeiling: -1.15 }
  }),
  p({
    id: 'pop-indonesia',
    name: 'Pop Indonesia',
    description: 'Clear Indonesian vocal focus, soft full bass, open acoustic detail, and polished but restrained high frequencies.',
    eq: [
      { ...DEFAULT_EQ_BANDS[0], frequency: 28 },
      { ...DEFAULT_EQ_BANDS[1], frequency: 80, gain: 1.12, q: 0.66 },
      { ...VOCAL_ACOUSTIC_BODY_BAND, frequency: 175, gain: 1.08, q: 2.3 },
      { ...DEFAULT_EQ_BANDS[2], frequency: 335, gain: -0.92, q: 0.84 },
      { ...VOCAL_BODY_GUARD_BAND, gain: 1.55, q: 0.80 },
      { ...DEFAULT_EQ_BANDS[3], frequency: 2100, gain: 1.16, q: 0.64 },
      { ...DEFAULT_EQ_BANDS[4], frequency: 6250, gain: 1.15, q: 0.58 },
      { ...DEFAULT_EQ_BANDS[5], frequency: 12650, gain: 2.95, q: 0.44 }
    ],
    compressor: { threshold: -24.5, ratio: 1.68, knee: 26, attack: 0.034, release: 0.22, makeupGain: 0.58, parallelMix: 91 },
    color: { drive: 2.88, body: 13.8, smartBass: 52, warmth: 13.4, harmonics: 30, air: 34, godParticles: 68, aiHighRepair: 50, velvetTreble: 74, vocalTickle: 55, vocalPresence: 58, midProjection: 57, mix: 25.8, stereoMid: 48 },
    width: { mix: 62, width: 134, lowMidWidth: 102, midWidth: 114, highWidth: 174, sourceProtect: 76, sideTone: 2.8 },
    output: { outputGain: -1.62, limiterDrive: 0.46, limiterCeiling: -1.1 }
  }),
  p({
    id: 'edm-santai',
    name: 'EDM Santai',
    description: 'Deep controlled electronic bass, clean synth layers, spacious highs, and lower output for enjoyable long sessions.',
    eq: [
      { ...DEFAULT_EQ_BANDS[0], frequency: 25 },
      { ...DEFAULT_EQ_BANDS[1], frequency: 68, gain: 1.72, q: 0.58 },
      { id: 'edm-punch', label: 'Electronic Punch', type: 'bell', frequency: 108, gain: 0.78, q: 0.62, slope: 12, enabled: true },
      { ...DEFAULT_EQ_BANDS[2], frequency: 350, gain: -1.05, q: 0.78 },
      { ...DEFAULT_EQ_BANDS[3], frequency: 2300, gain: 0.82, q: 0.60 },
      { ...DEFAULT_EQ_BANDS[4], frequency: 7000, gain: 1.22, q: 0.56 },
      { ...DEFAULT_EQ_BANDS[5], frequency: 13200, gain: 3.2, q: 0.42 },
      { ...VOCAL_BODY_GUARD_BAND, gain: 1.05, q: 0.86 }
    ],
    compressor: { threshold: -25.2, ratio: 1.82, knee: 24, attack: 0.028, release: 0.17, makeupGain: 0.50, parallelMix: 88 },
    color: { drive: 3.15, body: 13.5, smartBass: 70, warmth: 10.2, harmonics: 34, air: 38, godParticles: 76, aiHighRepair: 58, velvetTreble: 78, vocalTickle: 46, vocalPresence: 45, midProjection: 54, mix: 26.5, stereoMid: 66 },
    width: { mix: 72, width: 148, lowMidWidth: 101, midWidth: 120, highWidth: 194, sourceProtect: 70, sideTone: 3.45 },
    output: { outputGain: -1.95, limiterDrive: 0.55, limiterCeiling: -1.15 }
  }),
  p({
    id: 'jazz-hangat',
    name: 'Jazz Hangat',
    description: 'Natural upright bass, warm piano and brass, soft cymbal detail, relaxed imaging, and preserved dynamic expression.',
    eq: [
      { ...DEFAULT_EQ_BANDS[0], frequency: 28 },
      { ...DEFAULT_EQ_BANDS[1], frequency: 72, gain: 0.82, q: 0.72 },
      { ...VOCAL_ACOUSTIC_BODY_BAND, frequency: 165, gain: 1.12, q: 2.4 },
      { ...DEFAULT_EQ_BANDS[2], frequency: 310, gain: -0.48, q: 0.80 },
      { ...VOCAL_BODY_GUARD_BAND, gain: 1.3, q: 0.82 },
      { ...DEFAULT_EQ_BANDS[3], frequency: 1750, gain: 0.68, q: 0.72 },
      { ...DEFAULT_EQ_BANDS[4], frequency: 5700, gain: 0.48, q: 0.72 },
      { ...DEFAULT_EQ_BANDS[5], frequency: 11800, gain: 1.88, q: 0.50 }
    ],
    compressor: { threshold: -22.8, ratio: 1.42, knee: 30, attack: 0.055, release: 0.32, makeupGain: 0.40, parallelMix: 94 },
    color: { drive: 2.55, body: 14.0, smartBass: 38, warmth: 16.2, harmonics: 24, air: 22, godParticles: 46, aiHighRepair: 34, velvetTreble: 66, vocalTickle: 36, vocalPresence: 40, midProjection: 44, mix: 22.5, stereoMid: 32 },
    width: { mix: 50, width: 120, lowMidWidth: 101, midWidth: 106, highWidth: 140, sourceProtect: 90, sideTone: 1.75 },
    output: { outputGain: -1.88, limiterDrive: 0.34, limiterCeiling: -1.2 }
  }),
  p({
    id: 'akustik-intim',
    name: 'Akustik Intim',
    description: 'Close vocal and acoustic guitar presentation with natural body, delicate strings, restrained stereo width, and gentle output.',
    eq: [
      { ...DEFAULT_EQ_BANDS[0], frequency: 34 },
      { ...DEFAULT_EQ_BANDS[1], frequency: 88, gain: 0.55, q: 0.74 },
      { ...VOCAL_ACOUSTIC_BODY_BAND, frequency: 172, gain: 1.42, q: 2.35 },
      { ...DEFAULT_EQ_BANDS[2], frequency: 300, gain: -0.72, q: 0.86 },
      { ...VOCAL_BODY_GUARD_BAND, gain: 1.68, q: 0.78 },
      { ...DEFAULT_EQ_BANDS[3], frequency: 1950, gain: 0.92, q: 0.72 },
      { ...DEFAULT_EQ_BANDS[4], frequency: 5900, gain: 0.72, q: 0.68 },
      { ...DEFAULT_EQ_BANDS[5], frequency: 12200, gain: 2.15, q: 0.48 }
    ],
    compressor: { threshold: -23.2, ratio: 1.48, knee: 29, attack: 0.048, release: 0.29, makeupGain: 0.44, parallelMix: 93 },
    color: { drive: 2.62, body: 14.8, smartBass: 34, warmth: 14.8, harmonics: 25, air: 25, godParticles: 50, aiHighRepair: 38, velvetTreble: 68, vocalTickle: 46, vocalPresence: 52, midProjection: 48, mix: 23, stereoMid: 28 },
    width: { mix: 46, width: 116, lowMidWidth: 100, midWidth: 104, highWidth: 136, sourceProtect: 92, sideTone: 1.45 },
    output: { outputGain: -1.78, limiterDrive: 0.36, limiterCeiling: -1.2 }
  }),
  p({
    id: 'max-enhancer',
    name: 'Max Enhancer',
    description: 'Maximum musical enhancement with smarter breathing bass, creamy global mid detail, sweet presence, tasteful side tickle, and lively stereo — dopamine-rich and long-listening friendly.',
    eq: [
      // Tight sub clean to protect headroom for the louder, denser master.
      { ...DEFAULT_EQ_BANDS[0], frequency: 28, slope: 24 },
      // Solid, powerful low body (punch + warmth) without boom.
      { ...DEFAULT_EQ_BANDS[1], frequency: 88, gain: 1.55, q: 0.66 },
      // Gentle low-mid cleanup only; the smart body path now supplies body without nasal peaks.
      { ...DEFAULT_EQ_BANDS[2], frequency: 380, gain: -0.52, q: 0.62 },
      // Broad vocal presence. Avoid narrow 2–4 kHz emphasis that can expose resonances.
      { ...DEFAULT_EQ_BANDS[3], frequency: 2550, gain: 1.10, q: 0.56 },
      // Soft crisp detail, less peaky than the previous Max curve.
      { ...DEFAULT_EQ_BANDS[4], frequency: 6700, gain: 0.76, q: 0.54 },
      // Air shelf stays open but no longer over-feeds the exciter.
      { ...DEFAULT_EQ_BANDS[5], frequency: 12950, gain: 2.55, q: 0.42 },
      { id: 'vocal-body-490', label: 'Vocal Body Guard', type: 'bell', frequency: 490, gain: 1.5, q: 0.8, slope: 12, enabled: true }
    ],
    // Gentle glue with strong parallel blend: dense and powerful, transients intact.
    // Slightly slower attack + a touch more parallel lets mid-range transients
    // "tickle" through instead of being flattened.
    compressor: { threshold: -24.2, ratio: 1.8, knee: 24, attack: 0.032, release: 0.19, makeupGain: 0.82, parallelMix: 90 },
    // Modern harmonic excitation: richness + air = the "sweet/dopamine" factor, kept parallel so it stays clean.
    // stereoMid drives the real-side mid exciter so the genuine L-R "bersahutan" mid detail stays alive and energetic.
    color: { enabled: true, drive: 3.42, bodyFreq: 164, body: 15.8, smartBass: 64, warmthFreq: 505, warmth: 14.0, harmonicsFreq: 2100, harmonics: 31, airFreq: 12750, air: 31.0, godParticles: 68.0, aiHighRepair: 62, velvetTreble: 80, vocalTickle: 47, vocalPresence: 52, midProjection: 66, mix: 29, stereoMid: 64, mode: 'mastering' },
    // Lively multiband image. monoBass keeps the low end solid & mono (no LF phase smear);
    // the synthetic side is added antisymmetrically so it cancels in the mono sum -> zero phase issue.
    width: { enabled: true, mix: 66, width: 137, lowWidth: 100, lowMidWidth: 102, midWidth: 115, highWidth: 184, sourceProtect: 72, monoBass: true, monoBassFreq: 158, sideTone: 3.10 },
    // Loud and punchy with punch-protect on the limiter so it never pumps or fatigues.
    output: { outputGain: -1.9, limiterDrive: 0.54, limiterCeiling: -1.05, punchProtect: true }
  }),
  p({
    id: 'sonkuhoreg',
    name: 'SonKuHoreg',
    description: 'Indonesian slow-bass pressure preset: deep sub torque, wall-shake bass harmonics, thicker far-travelling mid, and left/right 3D harmonic sparkle that stays enjoyable.',
    eq: [
      // Deep sub is allowed lower than Max Enhancer, but still protected from DC/headroom waste.
      { ...DEFAULT_EQ_BANDS[0], frequency: 21, slope: 24 },
      // Slow-bass torque: the shelf sits lower so 45-75 Hz feels heavy instead of just boomy.
      { ...DEFAULT_EQ_BANDS[1], frequency: 58, gain: 3.20, q: 0.54 },
      { id: 'horeg-sub-torque', label: 'Sub Torque', type: 'bell', frequency: 72, gain: 1.15, q: 0.58, slope: 12, enabled: true },
      { id: 'horeg-wall-push', label: 'Wall Push', type: 'bell', frequency: 118, gain: 1.05, q: 0.62, slope: 12, enabled: true },
      { ...VOCAL_ACOUSTIC_BODY_BAND, frequency: 185, gain: 1.15, q: 2.0 },
      // Keep the roof-shake energy from spilling into mud/boxiness.
      { ...DEFAULT_EQ_BANDS[2], frequency: 345, gain: -0.82, q: 0.74 },
      { ...VOCAL_BODY_GUARD_BAND, gain: 1.76, q: 0.76 },
      // Far-travel mid: a small broad 1.38 kHz push helps the melody/vocal core carry farther without honk.
      { id: 'horeg-far-mid-glow', label: 'Far Mid Glow', type: 'bell', frequency: 1380, gain: 0.42, q: 0.68, slope: 12, enabled: true },
      // Mid travels further when the presence is thick but broad, not needle-like.
      { ...DEFAULT_EQ_BANDS[3], frequency: 2140, gain: 1.34, q: 0.60 },
      { id: 'horeg-3d-mid-sparkle', label: '3D Mid Sparkle', type: 'bell', frequency: 3720, gain: 1.00, q: 0.76, slope: 12, enabled: true },
      { ...DEFAULT_EQ_BANDS[4], frequency: 6750, gain: 0.54, q: 0.60 },
      { ...DEFAULT_EQ_BANDS[5], frequency: 13000, gain: 2.18, q: 0.50 }
    ],
    compressor: { threshold: -24.8, ratio: 1.75, knee: 24, attack: 0.038, release: 0.24, makeupGain: 0.72, parallelMix: 89 },
    color: {
      enabled: true,
      drive: 3.95,
      bodyFreq: 145,
      body: 20.6,
      smartBass: 94,
      warmthFreq: 500,
      warmth: 17.2,
      harmonicsFreq: 2050,
      harmonics: 40,
      airFreq: 12650,
      air: 20.8,
      godParticles: 64.5,
      aiHighRepair: 78,
      velvetTreble: 94,
      vocalTickle: 54,
      vocalPresence: 63,
      midProjection: 76,
      mix: 32,
      stereoMid: 78,
      mode: 'mastering'
    },
    width: { enabled: true, mix: 64, width: 126, lowWidth: 100, lowMidWidth: 101, midWidth: 113, highWidth: 148, sourceProtect: 92, monoBass: true, monoBassFreq: 170, sideTone: 1.62 },
    output: { outputGain: -2.0, limiterDrive: 0.66, limiterCeiling: -1.25, punchProtect: true }
  }),

  p({
    id: 'sonkubattle',
    name: 'SonKuBattle',
    description: 'Smart SPL battle preset: maximizes perceived dBA and dBC energy with dense bass torque, far-throwing mid, 3D harmonic sparkle, and clip-aware output control.',
    eq: [
      // Battle mode protects infrasonic headroom so the useful 50-125 Hz energy can hit harder.
      { ...DEFAULT_EQ_BANDS[0], frequency: 26, slope: 24 },
      { ...DEFAULT_EQ_BANDS[1], frequency: 62, gain: 2.85, q: 0.52 },
      { id: 'battle-dbc-torque', label: 'dBC Torque', type: 'bell', frequency: 78, gain: 1.45, q: 0.54, slope: 12, enabled: true },
      { id: 'battle-dbc-punch', label: 'dBC Punch', type: 'bell', frequency: 112, gain: 1.28, q: 0.58, slope: 12, enabled: true },
      { id: 'battle-small-speaker-bass', label: 'Bass Harmonic Push', type: 'bell', frequency: 166, gain: 0.78, q: 0.72, slope: 12, enabled: true },
      { ...VOCAL_ACOUSTIC_BODY_BAND, frequency: 205, gain: 0.92, q: 1.9 },
      { ...DEFAULT_EQ_BANDS[2], frequency: 318, gain: -1.12, q: 0.78 },
      { ...VOCAL_BODY_GUARD_BAND, gain: 1.62, q: 0.74 },
      // dBA projection: broad, not needle-like, so it carries far without harsh SPL pain.
      { id: 'battle-dba-throw', label: 'dBA Throw', type: 'bell', frequency: 1850, gain: 1.18, q: 0.62, slope: 12, enabled: true },
      { ...DEFAULT_EQ_BANDS[3], frequency: 2550, gain: 1.26, q: 0.58 },
      { id: 'battle-3d-spark', label: '3D Battle Spark', type: 'bell', frequency: 3480, gain: 1.10, q: 0.72, slope: 12, enabled: true },
      { id: 'battle-harsh-guard', label: 'Battle Harsh Guard', type: 'bell', frequency: 4700, gain: -0.22, q: 1.0, slope: 12, enabled: true },
      { ...DEFAULT_EQ_BANDS[4], frequency: 7050, gain: 0.58, q: 0.60 },
      { ...DEFAULT_EQ_BANDS[5], frequency: 12650, gain: 1.92, q: 0.50 }
    ],
    compressor: { threshold: -25.1, ratio: 1.92, knee: 24, attack: 0.030, release: 0.17, makeupGain: 0.62, parallelMix: 88 },
    color: {
      enabled: true,
      drive: 3.92,
      bodyFreq: 150,
      body: 21.4,
      smartBass: 94,
      warmthFreq: 505,
      warmth: 15.0,
      harmonicsFreq: 2250,
      harmonics: 44,
      airFreq: 12550,
      air: 20.2,
      godParticles: 66.0,
      aiHighRepair: 79,
      velvetTreble: 94,
      vocalTickle: 52,
      vocalPresence: 70,
      midProjection: 80,
      mix: 32,
      stereoMid: 82,
      mode: 'mastering'
    },
    width: { enabled: true, mix: 65, width: 126, lowWidth: 100, lowMidWidth: 101, midWidth: 114, highWidth: 148, sourceProtect: 92, monoBass: true, monoBassFreq: 178, sideTone: 1.66 },
    output: { outputGain: -2.2, limiterDrive: 0.68, limiterCeiling: -1.25, punchProtect: true }
  }),
  p({
    id: 'sonkubalap',
    name: 'SonKuBalap',
    description: 'Smart efficient sound-battle preset: gahar and powerful, tuned to push dBA/dBC energy while avoiding wasteful amp load in ultra-low sub and keeping mid/high throw alive.',
    eq: [
      // Amp-friendly battle tuning: cut unusable sub drain, then push efficient torque/body bands.
      { ...DEFAULT_EQ_BANDS[0], frequency: 31, slope: 24 },
      { ...DEFAULT_EQ_BANDS[1], frequency: 66, gain: 2.42, q: 0.50 },
      { id: 'balap-efficient-torque', label: 'Efficient Torque', type: 'bell', frequency: 82, gain: 1.30, q: 0.52, slope: 12, enabled: true },
      { id: 'balap-amp-punch', label: 'Amp Punch', type: 'bell', frequency: 118, gain: 1.18, q: 0.56, slope: 12, enabled: true },
      { id: 'balap-bass-harmonic', label: 'Bass Harmonic', type: 'bell', frequency: 158, gain: 0.92, q: 0.68, slope: 12, enabled: true },
      { ...VOCAL_ACOUSTIC_BODY_BAND, frequency: 210, gain: 0.86, q: 1.85 },
      { ...DEFAULT_EQ_BANDS[2], frequency: 305, gain: -1.18, q: 0.80 },
      { id: 'balap-box-control', label: 'Box Control', type: 'bell', frequency: 430, gain: -0.38, q: 0.88, slope: 12, enabled: true },
      { ...VOCAL_BODY_GUARD_BAND, gain: 1.58, q: 0.74 },
      // dBA throw with broad pressure, not painful needle boosts.
      { id: 'balap-mid-throw', label: 'Balap Mid Throw', type: 'bell', frequency: 1680, gain: 1.05, q: 0.62, slope: 12, enabled: true },
      { ...DEFAULT_EQ_BANDS[3], frequency: 2450, gain: 1.20, q: 0.58 },
      { id: 'balap-3d-spark', label: '3D Balap Spark', type: 'bell', frequency: 3550, gain: 1.02, q: 0.72, slope: 12, enabled: true },
      { id: 'balap-tweeter-safe', label: 'Tweeter Safe', type: 'bell', frequency: 5200, gain: -0.28, q: 0.96, slope: 12, enabled: true },
      { ...DEFAULT_EQ_BANDS[4], frequency: 7200, gain: 0.48, q: 0.60 },
      { ...DEFAULT_EQ_BANDS[5], frequency: 12750, gain: 1.72, q: 0.50 }
    ],
    compressor: { threshold: -25.0, ratio: 1.88, knee: 25, attack: 0.026, release: 0.16, makeupGain: 0.56, parallelMix: 88 },
    color: {
      enabled: true,
      drive: 3.82,
      bodyFreq: 152,
      body: 19.8,
      smartBass: 90,
      warmthFreq: 505,
      warmth: 14.2,
      harmonicsFreq: 2300,
      harmonics: 46,
      airFreq: 12600,
      air: 19.8,
      godParticles: 61.5,
      aiHighRepair: 80,
      velvetTreble: 94,
      vocalTickle: 53,
      vocalPresence: 72,
      midProjection: 82,
      mix: 30,
      stereoMid: 84,
      mode: 'mastering'
    },
    width: { enabled: true, mix: 65, width: 127, lowWidth: 100, lowMidWidth: 100, midWidth: 116, highWidth: 150, sourceProtect: 92, monoBass: true, monoBassFreq: 185, sideTone: 1.72 },
    output: { outputGain: -2.25, limiterDrive: 0.64, limiterCeiling: -1.25, punchProtect: true }
  }),
  p({
    id: 'audiophile-pop',
    name: 'Audiophile',
    description: 'Popular audiophile balance: clean vocal center, refined sparkle, controlled bass, non-fatiguing.',
    eq: [
      { ...DEFAULT_EQ_BANDS[0], frequency: 30, slope: 24 },
      { ...DEFAULT_EQ_BANDS[1], frequency: 84, gain: 0.95, q: 0.7 },
      { ...DEFAULT_EQ_BANDS[2], frequency: 350, gain: -0.72, q: 0.88 },
      { id: 'vocal-focus-audiophile', label: 'Vocal Focus', type: 'bell', frequency: 1900, gain: 0.65, q: 0.72, slope: 12, enabled: true },
      { ...DEFAULT_EQ_BANDS[4], frequency: 6100, gain: 0.78, q: 0.62 },
      { ...DEFAULT_EQ_BANDS[5], frequency: 12800, gain: 2.18, q: 0.48 },
      { id: 'vocal-body-490', label: 'Vocal Body Guard', type: 'bell', frequency: 490, gain: 1.5, q: 0.8, slope: 12, enabled: true }
    ],
    compressor: { threshold: -24, ratio: 1.65, knee: 22, attack: 0.032, release: 0.22, makeupGain: 0.55, parallelMix: 90 },
    color: { enabled: true, drive: 2.80, bodyFreq: 170, body: 12.8, smartBass: 54, warmthFreq: 500, warmth: 10.8, harmonicsFreq: 2050, harmonics: 27, airFreq: 12680, air: 28.4, godParticles: 63.0, aiHighRepair: 53, velvetTreble: 77, vocalTickle: 40, vocalPresence: 42, midProjection: 52, mix: 24, stereoMid: 37, mode: 'mastering' },
    width: { enabled: true, mix: 67, width: 140, lowWidth: 100, lowMidWidth: 102, midWidth: 116, highWidth: 186, sourceProtect: 70, monoBass: true, monoBassFreq: 148, sideTone: 3.18 },
    output: { outputGain: -2.1, limiterDrive: 0.28, limiterCeiling: -1 }
  }),
  p({
    id: 'pro-music',
    name: 'Punchy Music',
    description: 'Punchy bass, thick groove, stronger transient glue, and sparkling musical detail.',
    eq: [
      { ...DEFAULT_EQ_BANDS[0], frequency: 28, slope: 24 },
      { ...DEFAULT_EQ_BANDS[1], frequency: 82, gain: 2.12 },
      { ...DEFAULT_EQ_BANDS[2], frequency: 360, gain: -0.62, q: 0.86 },
      { id: 'mid-thick', label: 'Mid Thick', type: 'bell', frequency: 520, gain: 0.52, q: 0.78, slope: 12, enabled: true },
      { ...DEFAULT_EQ_BANDS[3], frequency: 2150, gain: 0.95, q: 0.78 },
      { ...DEFAULT_EQ_BANDS[4], frequency: 6000, gain: 0.48, q: 0.60 },
      { ...DEFAULT_EQ_BANDS[5], frequency: 13600, gain: 1.68 },
      { id: 'vocal-body-490', label: 'Vocal Body Guard', type: 'bell', frequency: 490, gain: 1.5, q: 0.8, slope: 12, enabled: true }
    ],
    compressor: { threshold: -23.8, ratio: 1.95, knee: 18, attack: 0.026, release: 0.18, makeupGain: 0.68, parallelMix: 91 },
    color: { enabled: true, drive: 4.05, bodyFreq: 165, body: 20.2, smartBass: 78, warmthFreq: 505, warmth: 16.2, harmonicsFreq: 2180, harmonics: 38, airFreq: 12700, air: 30.0, godParticles: 72.0, aiHighRepair: 59, velvetTreble: 80, vocalTickle: 52, vocalPresence: 56, midProjection: 68, mix: 34, stereoMid: 70, mode: 'mastering' },
    width: { enabled: true, mix: 68, width: 142, lowWidth: 100, lowMidWidth: 103, midWidth: 118, highWidth: 188, sourceProtect: 70, monoBass: true, monoBassFreq: 150, sideTone: 3.28 },
    output: { outputGain: -2.5, limiterDrive: 0.58, limiterCeiling: -1 }
  }),
  p({
    id: 'open-air-field',
    name: 'Open Air',
    description: 'Sound lapangan/open-air preset: bigger bass contour, forward vocal guard, strong side-air sparkle, limiter-safe.',
    eq: [
      { ...DEFAULT_EQ_BANDS[0], frequency: 32, slope: 24 },
      { id: 'field-low-contour', label: 'Field Low Contour', type: 'lowshelf', frequency: 92, gain: 2.55, q: 0.68, slope: 12, enabled: true },
      { id: 'field-lowmid-clean', label: 'Low-Mid Clean', type: 'bell', frequency: 330, gain: -1.28, q: 0.92, slope: 12, enabled: true },
      { id: 'field-vocal-guard', label: 'Vocal Guard', type: 'bell', frequency: 2050, gain: 1.05, q: 0.72, slope: 12, enabled: true },
      { id: 'field-bite', label: 'Field Bite', type: 'bell', frequency: 4300, gain: 0.26, q: 0.78, slope: 12, enabled: true },
      { id: 'field-air', label: 'Open Rounded Air', type: 'highshelf', frequency: 13800, gain: 1.04, q: 0.46, slope: 12, enabled: true },
      { id: 'vocal-body-490', label: 'Vocal Body Guard', type: 'bell', frequency: 490, gain: 1.5, q: 0.8, slope: 12, enabled: true }
    ],
    compressor: { threshold: -25.2, ratio: 2.05, knee: 20, attack: 0.028, release: 0.22, makeupGain: 0.45, parallelMix: 88 },
    color: { enabled: true, drive: 3.72, bodyFreq: 180, body: 18.6, smartBass: 68, warmthFreq: 510, warmth: 13.7, harmonicsFreq: 2100, harmonics: 32, airFreq: 12950, air: 17.6, godParticles: 55.8, aiHighRepair: 71, velvetTreble: 93, vocalTickle: 41, vocalPresence: 49, midProjection: 60, mix: 31, stereoMid: 46, mode: 'mastering' },
    width: { enabled: true, mix: 56, width: 117, lowWidth: 100, lowMidWidth: 101, midWidth: 105, highWidth: 135, sourceProtect: 98, monoBass: true, monoBassFreq: 190, sideTone: 1.12 },
    output: { outputGain: -3.1, limiterDrive: 0.52, limiterCeiling: -1.2 }
  }),
  p({
    id: 'movie-dolby',
    name: 'Movie Sub',
    description: 'Thick sub, clean low-mid, guarded dialogue clarity, smooth cinematic width.',
    eq: [
      { ...DEFAULT_EQ_BANDS[0], frequency: 24, slope: 24 },
      { ...DEFAULT_EQ_BANDS[1], frequency: 58, gain: 2.35, q: 0.70 },
      { id: 'sub-body', label: 'Sub Body', type: 'bell', frequency: 118, gain: 0.82, q: 0.84, slope: 12, enabled: true },
      { id: 'box-clean', label: 'De-box', type: 'bell', frequency: 370, gain: -1.55, q: 0.95, slope: 12, enabled: true },
      { id: 'de-honk', label: 'De-honk', type: 'bell', frequency: 680, gain: -0.85, q: 0.88, slope: 12, enabled: true },
      { id: 'dialogue', label: 'Dialogue', type: 'bell', frequency: 2650, gain: 1.25, q: 0.78, slope: 12, enabled: true },
      { ...DEFAULT_EQ_BANDS[4], frequency: 6100, gain: 0.30, q: 0.60 },
      { ...DEFAULT_EQ_BANDS[5], frequency: 13250, gain: 1.32 },
      { id: 'vocal-body-490', label: 'Vocal Body Guard', type: 'bell', frequency: 490, gain: 1.5, q: 0.8, slope: 12, enabled: true }
    ],
    compressor: { threshold: -24, ratio: 1.7, knee: 18, attack: 0.034, release: 0.28, makeupGain: 0.35, parallelMix: 90 },
    color: { enabled: true, drive: 2.90, bodyFreq: 180, body: 14.0, smartBass: 58, warmthFreq: 520, warmth: 12.6, harmonicsFreq: 1850, harmonics: 21, airFreq: 12350, air: 12.8, godParticles: 36.5, aiHighRepair: 68, velvetTreble: 94, vocalTickle: 25, vocalPresence: 30, midProjection: 36, mix: 24, stereoMid: 15, mode: 'warm' },
    width: { enabled: true, mix: 50, width: 114, lowWidth: 100, lowMidWidth: 101, midWidth: 103, highWidth: 127, sourceProtect: 98, monoBass: true, monoBassFreq: 165, sideTone: 0.82 },
    output: { outputGain: -2.4, limiterDrive: 0.22, limiterCeiling: -1.1 }
  }),
  p({
    id: 'podcast',
    name: 'Podcast',
    description: 'Voice-safe polish: controlled lows, smooth compression, soft air, no crackle.',
    eq: [
      { ...DEFAULT_EQ_BANDS[0], frequency: 86, slope: 24 },
      { ...DEFAULT_EQ_BANDS[1], frequency: 118, gain: 0.1 },
      { id: 'vocal-chest', label: 'Vocal Chest', type: 'bell', frequency: 190, gain: 0.52, q: 0.72, slope: 12, enabled: true },
      { ...DEFAULT_EQ_BANDS[2], frequency: 330, gain: -2.1, q: 1.00 },
      { ...DEFAULT_EQ_BANDS[3], frequency: 1850, gain: 0.98, q: 0.76 },
      { ...DEFAULT_EQ_BANDS[4], frequency: 3600, gain: 0.55, q: 0.82 },
      { id: 'sibilance-soften', label: 'Sibilance Smooth', type: 'bell', frequency: 6900, gain: -1.8, q: 1.8, slope: 12, enabled: true },
      { ...DEFAULT_EQ_BANDS[5], frequency: 11200, gain: 0.9 },
      { id: 'vocal-body-490', label: 'Vocal Body Guard', type: 'bell', frequency: 490, gain: 1.5, q: 0.8, slope: 12, enabled: true }
    ],
    compressor: { threshold: -26.5, ratio: 2.0, knee: 24, attack: 0.018, release: 0.26, makeupGain: 0.45, parallelMix: 80 },
    color: { enabled: true, drive: 0.90, bodyFreq: 165, body: 5.8, smartBass: 34, warmthFreq: 520, warmth: 8.4, harmonicsFreq: 1750, harmonics: 6, airFreq: 10800, air: 4.2, godParticles: 22.5, aiHighRepair: 64, velvetTreble: 88, vocalTickle: 29, vocalPresence: 34, midProjection: 40, mix: 9, stereoMid: 0, mode: 'clean' },
    width: { enabled: false, mix: 0, width: 100, lowWidth: 100, lowMidWidth: 100, midWidth: 100, highWidth: 108, monoBass: true, monoBassFreq: 145, sideTone: 0 },
    output: { outputGain: -2.9, limiterDrive: 0.06, limiterCeiling: -1.3 }
  }),
  p({
    id: 'night-listening',
    name: 'Night Listening',
    description: 'Soft, warm sleep-friendly dopamine: low-volume comfort, rounded presence, relaxed highs, and no stereo stimulation.',
    eq: [
      { ...DEFAULT_EQ_BANDS[0], frequency: 42, slope: 12 },
      { ...DEFAULT_EQ_BANDS[1], frequency: 98, gain: -1.15 },
      { ...DEFAULT_EQ_BANDS[2], frequency: 360, gain: -0.55, q: 0.82 },
      { ...DEFAULT_EQ_BANDS[3], frequency: 1500, gain: 0.22, q: 0.75 },
      { ...DEFAULT_EQ_BANDS[4], frequency: 4800, gain: -1.25, q: 0.80 },
      { ...DEFAULT_EQ_BANDS[5], frequency: 7800, gain: -2.25 },
      { id: 'vocal-body-490', label: 'Vocal Body Guard', type: 'bell', frequency: 490, gain: 0.85, q: 0.8, slope: 12, enabled: true }
    ],
    compressor: { threshold: -33, ratio: 2.65, knee: 24, attack: 0.026, release: 0.42, makeupGain: 1.0, parallelMix: 72 },
    color: { enabled: true, drive: 0.78, bodyFreq: 155, body: 3.0, smartBass: 42, warmthFreq: 470, warmth: 9.8, harmonicsFreq: 1500, harmonics: 4, airFreq: 9200, air: -5.6, godParticles: 10, aiHighRepair: 72, velvetTreble: 90, vocalTickle: 6, vocalPresence: 9, midProjection: 14, mix: 10, stereoMid: 0, mode: 'warm' },
    width: { enabled: false, mix: 0, width: 96, lowWidth: 100, lowMidWidth: 96, midWidth: 92, highWidth: 98, sourceProtect: 100, monoBass: true, monoBassFreq: 120, sideTone: -1.4 },
    output: { outputGain: -5.2, limiterDrive: 0.05, limiterCeiling: -1.5 }
  })
];

export const MODULE_PRESETS = {
  eq: [
    {
      id: 'default-polish',
      name: 'Mas Ari Signature Sparkle Balance',
      eqEnabled: true,
      eq: DEFAULT_EQ_BANDS
    },
    {
      id: 'punchy-music',
      name: 'Punchy Music',
      eqEnabled: true,
      eq: [
        { ...DEFAULT_EQ_BANDS[0], frequency: 28, slope: 24 },
        { ...DEFAULT_EQ_BANDS[1], frequency: 82, gain: 1.85 },
        { ...DEFAULT_EQ_BANDS[2], frequency: 350, gain: -0.65, q: 0.86 },
        { id: 'mid-thick-eq', label: 'Mid Thick', type: 'bell', frequency: 520, gain: 0.72, q: 0.78, slope: 12, enabled: true },
        { ...DEFAULT_EQ_BANDS[3], frequency: 2100, gain: 0.62, q: 0.78 },
        { ...DEFAULT_EQ_BANDS[4], frequency: 5000, gain: 0.78, q: 0.86 },
        { ...DEFAULT_EQ_BANDS[5], frequency: 11800, gain: 1.35 },
        { id: 'vocal-body-490', label: 'Vocal Body Guard', type: 'bell', frequency: 490, gain: 1.5, q: 0.8, slope: 12, enabled: true }
      ]
    },
    {
      id: 'dialog-clarity',
      name: 'Dialog Clarity',
      eqEnabled: true,
      eq: [
        { ...DEFAULT_EQ_BANDS[0], frequency: 70, slope: 24 },
        { ...DEFAULT_EQ_BANDS[1], frequency: 130, gain: 0.6 },
        { id: 'dialog-chest-eq', label: 'Chest', type: 'bell', frequency: 190, gain: 0.58, q: 0.78, slope: 12, enabled: true },
        { ...DEFAULT_EQ_BANDS[2], frequency: 310, gain: -1.8, q: 1.15 },
        { ...DEFAULT_EQ_BANDS[3], frequency: 1650, gain: 0.92, q: 0.78 },
        { ...DEFAULT_EQ_BANDS[4], frequency: 3900, gain: 0.85, q: 0.84 },
        { ...DEFAULT_EQ_BANDS[5], frequency: 10400, gain: 0.45 },
        { id: 'vocal-body-490', label: 'Vocal Body Guard', type: 'bell', frequency: 490, gain: 1.2, q: 0.8, slope: 12, enabled: true }
      ]
    },
    {
      id: 'airy-detail',
      name: 'Airy Detail',
      eqEnabled: true,
      eq: [
        { ...DEFAULT_EQ_BANDS[0], frequency: 34, slope: 24 },
        { ...DEFAULT_EQ_BANDS[1], frequency: 96, gain: 0.6 },
        { ...DEFAULT_EQ_BANDS[2], frequency: 260, gain: -0.9, q: 1 },
        { ...DEFAULT_EQ_BANDS[3], frequency: 2300, gain: 0.55, q: 0.78 },
        { ...DEFAULT_EQ_BANDS[4], frequency: 6400, gain: 0.82, q: 0.78 },
        { ...DEFAULT_EQ_BANDS[5], frequency: 12800, gain: 1.28 },
        { id: 'vocal-body-490', label: 'Vocal Body Guard', type: 'bell', frequency: 490, gain: 1.5, q: 0.8, slope: 12, enabled: true }
      ]
    },
    {
      id: 'open-air-field-eq',
      name: 'Open Air Field',
      eqEnabled: true,
      eq: [
        { ...DEFAULT_EQ_BANDS[0], frequency: 32, slope: 24 },
        { id: 'field-low-contour-eq', label: 'Field Low Contour', type: 'lowshelf', frequency: 92, gain: 2.55, q: 0.68, slope: 12, enabled: true },
        { id: 'field-lowmid-clean-eq', label: 'Low-Mid Clean', type: 'bell', frequency: 330, gain: -1.28, q: 0.92, slope: 12, enabled: true },
        { id: 'field-vocal-guard-eq', label: 'Vocal Guard', type: 'bell', frequency: 2050, gain: 1.05, q: 0.72, slope: 12, enabled: true },
        { id: 'field-bite-eq', label: 'Field Bite', type: 'bell', frequency: 4300, gain: 0.42, q: 0.90, slope: 12, enabled: true },
        { id: 'field-air-eq', label: 'Open Air', type: 'highshelf', frequency: 12850, gain: 1.30, q: 0.50, slope: 12, enabled: true },
        { id: 'vocal-body-490', label: 'Vocal Body Guard', type: 'bell', frequency: 490, gain: 1.5, q: 0.8, slope: 12, enabled: true }
      ]
    },
    {
      id: 'night-soft-eq',
      name: 'Night Soft',
      eqEnabled: true,
      eq: [
        { ...DEFAULT_EQ_BANDS[0], frequency: 42, slope: 12 },
        { ...DEFAULT_EQ_BANDS[1], frequency: 105, gain: -1.8 },
        { ...DEFAULT_EQ_BANDS[2], frequency: 360, gain: -0.55, q: 0.82 },
        { ...DEFAULT_EQ_BANDS[3], frequency: 1500, gain: 0.22, q: 0.75 },
        { ...DEFAULT_EQ_BANDS[4], frequency: 4800, gain: -1.25, q: 0.80 },
        { ...DEFAULT_EQ_BANDS[5], frequency: 7800, gain: -2.25 },
        { id: 'vocal-body-490', label: 'Vocal Body Guard', type: 'bell', frequency: 490, gain: 0.85, q: 0.8, slope: 12, enabled: true }
      ]
    }
  ],
  compressor: [
    { id: 'master-glue', name: 'Master Glue', compressor: DEFAULT_COMPRESSOR },
    { id: 'punch-glue', name: 'Punch Glue', compressor: { threshold: -23.8, ratio: 1.95, knee: 18, attack: 0.026, release: 0.18, makeupGain: 0.68, parallelMix: 91, enabled: true } },
    { id: 'dialog-leveler', name: 'Dialog Leveler', compressor: { threshold: -26.8, ratio: 1.95, knee: 24, attack: 0.016, release: 0.26, makeupGain: 0.55, parallelMix: 84, enabled: true } },
    { id: 'vocal-smooth', name: 'Vocal Smooth', compressor: { threshold: -27.2, ratio: 2.05, knee: 24, attack: 0.018, release: 0.28, makeupGain: 0.62, parallelMix: 82, enabled: true } },
    { id: 'night-level', name: 'Night Level', compressor: { threshold: -33, ratio: 2.65, knee: 24, attack: 0.026, release: 0.42, makeupGain: 1.0, parallelMix: 72, enabled: true } }
  ],
  color: [
    { id: 'signature-glow', name: 'Mas Ari Signature Glow', color: DEFAULT_COLOR },
    { id: 'clean-glow', name: 'Clean Glow', color: { enabled: true, drive: 1.75, bodyFreq: 170, body: 8.5, smartBass: 48, warmthFreq: 490, warmth: 6.8, harmonicsFreq: 1950, harmonics: 16, airFreq: 11970, air: 11, godParticles: 33.8, aiHighRepair: 58, velvetTreble: 87, vocalTickle: 24, vocalPresence: 31, midProjection: 38, mix: 20, stereoMid: 8, mode: 'clean' } },
    { id: 'modern-exciter', name: 'Analog Lift', color: { enabled: true, drive: 3.20, bodyFreq: 170, body: 15.3, smartBass: 61, warmthFreq: 490, warmth: 12.6, harmonicsFreq: 2150, harmonics: 29, airFreq: 12420, air: 16.7, godParticles: 52.2, aiHighRepair: 64, velvetTreble: 89, vocalTickle: 37, vocalPresence: 46, midProjection: 58, mix: 26, stereoMid: 35, mode: 'mastering' } },
    { id: 'side-sparkle', name: 'Silky Sparkle', color: { enabled: true, drive: 2.70, bodyFreq: 170, body: 9.8, smartBass: 52, warmthFreq: 490, warmth: 8.0, harmonicsFreq: 2250, harmonics: 27, airFreq: 12920, air: 23.4, godParticles: 68.0, aiHighRepair: 62, velvetTreble: 86, vocalTickle: 35, vocalPresence: 42, midProjection: 50, mix: 25, stereoMid: 38, mode: 'mastering' } },
    { id: 'ai-high-repair', name: 'AI High Repair', color: { enabled: true, drive: 2.05, bodyFreq: 170, body: 9.2, smartBass: 50, warmthFreq: 490, warmth: 8.2, harmonicsFreq: 1900, harmonics: 17, airFreq: 11970, air: 13.6, godParticles: 39.5, aiHighRepair: 78, velvetTreble: 94, vocalTickle: 26, vocalPresence: 33, midProjection: 42, mix: 20, stereoMid: 12, mode: 'mastering' } },
    { id: 'field-sonic', name: 'Open Air Thick', color: { enabled: true, drive: 3.42, bodyFreq: 185, body: 17.0, smartBass: 68, warmthFreq: 500, warmth: 12.4, harmonicsFreq: 2050, harmonics: 28, airFreq: 11970, air: 17.1, godParticles: 65.4, aiHighRepair: 66, velvetTreble: 90, vocalTickle: 32, vocalPresence: 42, midProjection: 54, mix: 29, stereoMid: 34, mode: 'mastering' } },
    { id: 'voice-polish', name: 'Voice Thick', color: { enabled: true, drive: 0.90, bodyFreq: 165, body: 5.8, smartBass: 34, warmthFreq: 520, warmth: 8.4, harmonicsFreq: 1750, harmonics: 6, airFreq: 10800, air: 4.2, godParticles: 22.5, aiHighRepair: 64, velvetTreble: 88, vocalTickle: 29, vocalPresence: 34, midProjection: 40, mix: 9, stereoMid: 0, mode: 'clean' } },
    { id: 'thick-sweet', name: 'Thick Warm', color: { enabled: true, drive: 3.08, bodyFreq: 175, body: 17.8, smartBass: 63, warmthFreq: 500, warmth: 16.2, harmonicsFreq: 1850, harmonics: 24, airFreq: 11570, air: 10, godParticles: 32, aiHighRepair: 62, velvetTreble: 94, vocalTickle: 24, vocalPresence: 29, midProjection: 34, mix: 27, stereoMid: 22, mode: 'warm' } },
    { id: 'night-warm', name: 'Night Warm', color: { enabled: true, drive: 0.78, bodyFreq: 155, body: 3.0, smartBass: 42, warmthFreq: 470, warmth: 9.8, harmonicsFreq: 1500, harmonics: 4, airFreq: 9200, air: -5.6, godParticles: 10, aiHighRepair: 72, velvetTreble: 90, vocalTickle: 6, vocalPresence: 9, midProjection: 14, mix: 10, stereoMid: 0, mode: 'warm' } }
  ],
  width: [
    { id: 'natural-stereo', name: 'Natural Stereo', width: DEFAULT_WIDTH },
    { id: 'wide-music', name: 'Wide Music', width: { enabled: true, mix: 68, width: 142, lowWidth: 100, lowMidWidth: 103, midWidth: 118, highWidth: 188, sourceProtect: 70, monoBass: true, monoBassFreq: 150, sideTone: 3.28 } },
    { id: 'ultra-wide-air', name: 'Ultra Wide Air', width: { enabled: true, mix: 72, width: 150, lowWidth: 100, lowMidWidth: 102, midWidth: 122, highWidth: 196, sourceProtect: 66, monoBass: true, monoBassFreq: 172, sideTone: 3.70 } },
    { id: 'open-air-wide', name: 'Open Air Wide', width: { enabled: true, mix: 56, width: 117, lowWidth: 100, lowMidWidth: 101, midWidth: 105, highWidth: 135, sourceProtect: 98, monoBass: true, monoBassFreq: 190, sideTone: 1.12 } },
    { id: 'cinema-wide', name: 'Cinema Safe', width: { enabled: true, mix: 50, width: 114, lowWidth: 100, lowMidWidth: 101, midWidth: 103, highWidth: 127, sourceProtect: 98, monoBass: true, monoBassFreq: 165, sideTone: 0.82 } },
    { id: 'vocal-center', name: 'Vocal Center', width: { enabled: false, mix: 0, width: 100, lowWidth: 100, lowMidWidth: 100, midWidth: 100, highWidth: 108, monoBass: true, monoBassFreq: 145, sideTone: 0 } },
    { id: 'night-narrow', name: 'Night Narrow', width: { enabled: false, mix: 0, width: 96, lowWidth: 100, lowMidWidth: 96, midWidth: 92, highWidth: 98, sourceProtect: 100, monoBass: true, monoBassFreq: 140, sideTone: -1.4 } }
  ],
  limiter: [
    { id: 'safe-master', name: 'Safe Master', output: { inputGain: 0, outputGain: -1.8, limiterEnabled: true, limiterCeiling: -1, limiterDrive: 0.28, punchProtect: true } },
    { id: 'loud-punch', name: 'Loud Punch', output: { inputGain: 0, outputGain: -2.1, limiterEnabled: true, limiterCeiling: -1, limiterDrive: 0.62, punchProtect: true } },
    { id: 'open-air-guard', name: 'Open Air Guard', output: { inputGain: 0, outputGain: -3.1, limiterEnabled: true, limiterCeiling: -1.2, limiterDrive: 0.52, punchProtect: true } },
    { id: 'cinema-headroom', name: 'Cinema Clean', output: { inputGain: 0, outputGain: -2.4, limiterEnabled: true, limiterCeiling: -1.1, limiterDrive: 0.22, punchProtect: true } },
    { id: 'voice-steady', name: 'Voice Steady', output: { inputGain: 0.2, outputGain: -2.6, limiterEnabled: true, limiterCeiling: -1.2, limiterDrive: 0.07, punchProtect: true } },
    { id: 'night-low', name: 'Night Low', output: { inputGain: -1.2, outputGain: -5.2, limiterEnabled: true, limiterCeiling: -1.5, limiterDrive: 0.05, punchProtect: true } }
  ]
};

export function clonePreset(preset) {
  return JSON.parse(JSON.stringify(preset));
}

export function normalizeEqBand(band, index = 0) {
  const fallback = DEFAULT_EQ_BANDS[index % DEFAULT_EQ_BANDS.length] || DEFAULT_EQ_BANDS[0];
  const rawType = band?.type || fallback.type;
  const type = rawType === 'peaking' ? 'bell' : rawType === 'highpass' ? 'lowcut' : rawType === 'lowpass' ? 'highcut' : rawType;
  return {
    id: band?.id || `band-${Date.now()}-${index}`,
    label: band?.label || EQ_TYPE_LABELS[type] || fallback.label || `Band ${index + 1}`,
    type: EQ_TYPE_LABELS[type] ? type : fallback.type,
    frequency: clampNumber(band?.frequency ?? band?.freq ?? fallback.frequency, 20, 20000),
    gain: clampNumber(band?.gain ?? fallback.gain ?? 0, -24, 24),
    q: clampNumber(band?.q ?? band?.Q ?? fallback.q ?? 1, 0.1, 24),
    slope: [12, 24, 36, 48].includes(Number(band?.slope)) ? Number(band.slope) : (fallback.slope || 12),
    enabled: band?.enabled !== false
  };
}

function isVocalBodyGuardLike(band) {
  return band.id === VOCAL_BODY_GUARD_BAND.id
    || (band.type === 'bell' && band.frequency >= 450 && band.frequency <= 540 && band.gain >= 0.7);
}

function isVocalAcousticBodyLike(band) {
  return band.id === VOCAL_ACOUSTIC_BODY_BAND.id
    || (band.type === 'bell' && band.frequency >= 150 && band.frequency <= 190 && band.gain >= 0.45);
}

function insertSupportBand(bands, target, matcher) {
  const existingIndex = bands.findIndex(matcher);
  const support = existingIndex >= 0 ? { ...bands[existingIndex] } : { ...target };
  const withoutSupport = existingIndex >= 0 ? bands.filter((_, index) => index !== existingIndex) : bands;
  const insertAt = withoutSupport.findIndex((band) => band.frequency > support.frequency);
  return insertAt < 0
    ? [...withoutSupport, support]
    : [...withoutSupport.slice(0, insertAt), support, ...withoutSupport.slice(insertAt)];
}

export function normalizeEqBands(bands) {
  const source = Array.isArray(bands) && bands.length ? bands : DEFAULT_EQ_BANDS;
  const normalized = source.map((band, index) => normalizeEqBand(band, index));
  return insertSupportBand(
    insertSupportBand(normalized, VOCAL_ACOUSTIC_BODY_BAND, isVocalAcousticBodyLike),
    VOCAL_BODY_GUARD_BAND,
    isVocalBodyGuardLike
  );
}

export function normalizeCompressor(compressor = {}) {
  return {
    ...DEFAULT_COMPRESSOR,
    ...compressor,
    threshold: clampNumber(compressor.threshold ?? DEFAULT_COMPRESSOR.threshold, -60, 0),
    ratio: clampNumber(compressor.ratio ?? DEFAULT_COMPRESSOR.ratio, 1, 20),
    knee: clampNumber(compressor.knee ?? DEFAULT_COMPRESSOR.knee, 0, 40),
    attack: clampNumber(compressor.attack ?? DEFAULT_COMPRESSOR.attack, 0.001, 0.2),
    release: clampNumber(compressor.release ?? DEFAULT_COMPRESSOR.release, 0.02, 1.5),
    makeupGain: clampNumber(compressor.makeupGain ?? DEFAULT_COMPRESSOR.makeupGain, -18, 18),
    parallelMix: clampNumber(compressor.parallelMix ?? DEFAULT_COMPRESSOR.parallelMix, 0, 100),
    enabled: compressor.enabled !== false
  };
}

export function normalizeColor(color = {}) {
  return {
    ...DEFAULT_COLOR,
    ...color,
    enabled: color.enabled !== false,
    drive: clampNumber(color.drive ?? DEFAULT_COLOR.drive, 0, 24),
    bodyFreq: clampNumber(color.bodyFreq ?? DEFAULT_COLOR.bodyFreq, 95, 260),
    body: clampNumber(color.body ?? DEFAULT_COLOR.body, -24, 24),
    smartBass: clampNumber(color.smartBass ?? DEFAULT_COLOR.smartBass, 0, 100),
    warmthFreq: clampNumber(color.warmthFreq ?? DEFAULT_COLOR.warmthFreq, 300, 760),
    harmonics: clampNumber(color.harmonics ?? DEFAULT_COLOR.harmonics, 0, 100),
    harmonicsFreq: clampNumber(color.harmonicsFreq ?? DEFAULT_COLOR.harmonicsFreq, 1200, 3600),
    warmth: clampNumber(color.warmth ?? DEFAULT_COLOR.warmth, -24, 24),
    airFreq: clampNumber(color.airFreq ?? DEFAULT_COLOR.airFreq, 6500, 16000),
    air: clampNumber(color.air ?? DEFAULT_COLOR.air, -24, 48),
    aiHighRepair: clampNumber(color.aiHighRepair ?? DEFAULT_COLOR.aiHighRepair, 0, 100),
    velvetTreble: clampNumber(color.velvetTreble ?? DEFAULT_COLOR.velvetTreble, 0, 100),
    godParticles: clampNumber(color.godParticles ?? DEFAULT_COLOR.godParticles, 0, 100),
    vocalTickle: clampNumber(color.vocalTickle ?? DEFAULT_COLOR.vocalTickle, 0, 100),
    vocalPresence: clampNumber(color.vocalPresence ?? DEFAULT_COLOR.vocalPresence, 0, 100),
    midProjection: clampNumber(color.midProjection ?? DEFAULT_COLOR.midProjection, 0, 100),
    mix: clampNumber(color.mix ?? DEFAULT_COLOR.mix, 0, 100),
    stereoMid: clampNumber(color.stereoMid ?? DEFAULT_COLOR.stereoMid, 0, 100),
    mode: ['clean', 'warm', 'modern', 'mastering'].includes(color.mode) ? color.mode : DEFAULT_COLOR.mode
  };
}

export function normalizeWidth(width = {}) {
  const master = clampNumber(width.width ?? DEFAULT_WIDTH.width, 0, 200);
  const expand = Math.max(0, master - 100);
  const narrow = Math.max(0, 100 - master);
  const derivedLow = width.monoBass === false ? 100 + expand * 0.08 - narrow * 0.55 : 100;
  const derivedLowMid = 100 + expand * 0.16 - narrow * 0.60;
  const derivedMid = 100 + expand * 0.44 - narrow * 0.85;
  const derivedHigh = 100 + expand * 1.45 - narrow * 0.90;
  return {
    ...DEFAULT_WIDTH,
    ...width,
    enabled: width.enabled !== false,
    mix: clampNumber(width.mix ?? DEFAULT_WIDTH.mix, 0, 100),
    width: master,
    lowWidth: clampNumber(width.lowWidth ?? derivedLow, 0, 200),
    lowMidWidth: clampNumber(width.lowMidWidth ?? derivedLowMid, 0, 200),
    midWidth: clampNumber(width.midWidth ?? derivedMid, 0, 200),
    highWidth: clampNumber(width.highWidth ?? derivedHigh, 0, 200),
    sourceProtect: clampNumber(width.sourceProtect ?? DEFAULT_WIDTH.sourceProtect, 0, 100),
    monoBass: width.monoBass !== false,
    monoBassFreq: clampNumber(width.monoBassFreq ?? DEFAULT_WIDTH.monoBassFreq, 60, 250),
    sideTone: clampNumber(width.sideTone ?? DEFAULT_WIDTH.sideTone, -12, 18)
  };
}

export function normalizeOutput(output = {}) {
  return {
    ...DEFAULT_OUTPUT,
    ...output,
    inputGain: clampNumber(output.inputGain ?? DEFAULT_OUTPUT.inputGain, -24, 18),
    outputGain: clampNumber(output.outputGain ?? DEFAULT_OUTPUT.outputGain, -24, 18),
    limiterCeiling: clampNumber(output.limiterCeiling ?? DEFAULT_OUTPUT.limiterCeiling, -12, 0),
    limiterDrive: clampNumber(output.limiterDrive ?? DEFAULT_OUTPUT.limiterDrive, 0, 12),
    limiterEnabled: output.limiterEnabled !== false,
    punchProtect: output.punchProtect !== false,
    bypass: output.bypass === true
  };
}

export function createDefaultState() {
  const startupPreset = FACTORY_PRESETS.find((preset) => preset.id === 'default') || FACTORY_PRESETS[0];
  return {
    active: false,
    tabId: null,
    sourceTitle: 'No active capture',
    selectedPresetId: startupPreset.id,
    defaultMasterRevision: DEFAULT_MASTER_REVISION,
    performance: { mode: 'stable', autoSelected: true, userSelected: false, source: 'stability-default-v0.3.103', stabilityRevision: 1 },
    eqEnabled: startupPreset.eqEnabled !== false,
    eq: normalizeEqBands(startupPreset.eq),
    compressor: normalizeCompressor(startupPreset.compressor),
    color: normalizeColor(startupPreset.color),
    width: normalizeWidth(startupPreset.width),
    output: normalizeOutput(startupPreset.output),
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
      clipping: false
    },
    updatedAt: Date.now()
  };
}

export function applyPresetToState(state, preset) {
  const nextPreset = clonePreset(preset);
  return {
    ...state,
    selectedPresetId: preset.id,
    defaultMasterRevision: preset.id === 'default' ? DEFAULT_MASTER_REVISION : state.defaultMasterRevision,
    eqEnabled: nextPreset.eqEnabled !== false,
    eq: normalizeEqBands(nextPreset.eq),
    compressor: normalizeCompressor(nextPreset.compressor),
    color: normalizeColor(nextPreset.color),
    width: normalizeWidth(nextPreset.width),
    output: normalizeOutput(nextPreset.output),
    updatedAt: Date.now()
  };
}

export function toWebAudioType(type) {
  return WEB_AUDIO_TYPE[type] || 'peaking';
}

export function isCutType(type) {
  return type === 'lowcut' || type === 'highcut';
}

export function dbToGain(db) {
  return Math.pow(10, Number(db || 0) / 20);
}

export function gainToDb(gain) {
  return gain <= 0 ? -120 : 20 * Math.log10(gain);
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}


