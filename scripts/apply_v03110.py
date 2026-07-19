#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD = "0.3.109"
NEW = "0.3.110"


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, text):
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    if text.count(old) != 1:
        raise RuntimeError(f"Expected exactly one {label}, found {text.count(old)}")
    return text.replace(old, new, 1)


# Release/version metadata.
for path in ["manifest.json", "package.json", ".release/release.json", "README.md", "docs/index.html", "docs/id/index.html"]:
    text = read(path)
    if OLD not in text:
        raise RuntimeError(f"Missing {OLD} in {path}")
    write(path, text.replace(OLD, NEW))

# Flagship and genre-derived presets.
presets_path = "src/shared/presets.js"
presets = read(presets_path)
presets = replace_once(
    presets,
    "  'default',\n  'max-enhancer',",
    "  'default',\n  'dangdut-mantap',\n  'kpop-nikmat',\n  'hard-rock',\n  'blues-asik',\n  'pop-indonesia',\n  'edm-santai',\n  'jazz-hangat',\n  'akustik-intim',\n  'max-enhancer',",
    "primary preset insertion",
)

old_default = """  p({
    id: 'default',
    name: 'MasAri',
    description: 'Balanced Audiophile+MasAri signature: bass bulat bernapas, mid keluar natural, global sheen particles, velvet treble, enjoyable for long repeat listening.',
    eq: DEFAULT_EQ_BANDS,
    compressor: DEFAULT_COMPRESSOR,
    color: DEFAULT_COLOR,
    width: DEFAULT_WIDTH,
    output: DEFAULT_OUTPUT
  }),
"""

new_default = """  p({
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
"""
presets = replace_once(presets, old_default, new_default, "default preset block")
write(presets_path, presets)

# Popup copy and Studio support interstitial.
popup_html = read("popup.html")
popup_html = replace_once(
    popup_html,
    '      <p class="support-local-note">Payments are not tracked by the extension. “I’ve supported” only hides this reminder on the current Chrome profile.</p>\n      <div class="support-modal-actions">',
    '      <p class="support-local-note">Payments are not tracked by the extension. “I’ve supported” only hides this reminder on the current Chrome profile.</p>\n      <button id="supportContinueStudioButton" class="primary-button support-continue-studio" type="button" hidden>Continue to Studio</button>\n      <div class="support-modal-actions">',
    "studio continue button",
)
write("popup.html", popup_html)

popup_js = read("src/popup/popup.js")
popup_js = popup_js.replace("const MASARI_PRESET_LABEL = 'MasAri';", "const MASARI_PRESET_LABEL = 'Mas Ari Signature';")
popup_js = replace_once(
    popup_js,
    "  supportModal: document.getElementById('supportModal'),\n  supportModalBackdrop: document.getElementById('supportModalBackdrop'),",
    "  supportModal: document.getElementById('supportModal'),\n  supportModalTitle: document.getElementById('supportModalTitle'),\n  supportModalDescription: document.getElementById('supportModalDescription'),\n  supportModalBackdrop: document.getElementById('supportModalBackdrop'),",
    "support modal title refs",
)
popup_js = replace_once(
    popup_js,
    "  supportConfirmedButton: document.getElementById('supportConfirmedButton'),\n  supportPageButton: document.getElementById('supportPageButton')",
    "  supportConfirmedButton: document.getElementById('supportConfirmedButton'),\n  supportContinueStudioButton: document.getElementById('supportContinueStudioButton'),\n  supportPageButton: document.getElementById('supportPageButton')",
    "support continue ref",
)
popup_js = replace_once(
    popup_js,
    "let supportModalAutomatic = false;",
    "let supportModalAutomatic = false;\nlet supportModalStudioGate = false;",
    "studio gate state",
)
popup_js = replace_once(
    popup_js,
    "  ui.supportDevelopmentButton?.addEventListener('click', () => showSupportPrompt({ automatic: false }));",
    "  ui.supportDevelopmentButton?.addEventListener('click', () => showSupportPrompt({ automatic: false, studioGate: false }));",
    "manual support event",
)
popup_js = replace_once(
    popup_js,
    "  ui.supportConfirmedButton?.addEventListener('click', confirmSupportLocally);\n  ui.supportPageButton?.addEventListener('click', () => openSupportPage().catch((error) => setHint(error.message)));",
    "  ui.supportConfirmedButton?.addEventListener('click', confirmSupportLocally);\n  ui.supportContinueStudioButton?.addEventListener('click', continueToStudio);\n  ui.supportPageButton?.addEventListener('click', () => openSupportPage().catch((error) => setHint(error.message)));",
    "continue studio event",
)
popup_js = replace_once(
    popup_js,
    "  ui.openStudioButton.addEventListener('click', () => {\n    sendMessage({ target: 'background', type: 'OPEN_STUDIO' }).catch((error) => setHint(error.message));\n  });",
    "  ui.openStudioButton.addEventListener('click', openStudioWithSupportPrompt);",
    "studio button handler",
)

old_show = """function showSupportPrompt({ automatic = false } = {}) {
  if (!ui.supportModal) return;
  supportModalAutomatic = automatic;
  ui.supportModal.hidden = false;
  ui.supportModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('support-modal-open');
  requestAnimationFrame(() => ui.supportModalCloseButton?.focus());
}
"""
new_show = """function showSupportPrompt({ automatic = false, studioGate = false } = {}) {
  if (!ui.supportModal) return;
  supportModalAutomatic = automatic;
  supportModalStudioGate = studioGate;
  if (ui.supportModalTitle) ui.supportModalTitle.textContent = studioGate ? 'Support SonkuPik before Studio' : 'Support SonkuPik development';
  if (ui.supportModalDescription) ui.supportModalDescription.textContent = studioGate
    ? 'Studio remains fully free. Scan QRIS only when you would like to support continued DSP development, then continue immediately.'
    : 'ArSonKuPik stays fully functional and free. After 90 days of use, this optional reminder helps fund continued DSP development, testing, and support.';
  if (ui.supportContinueStudioButton) ui.supportContinueStudioButton.hidden = !studioGate;
  if (ui.supportLaterButton) ui.supportLaterButton.hidden = studioGate;
  ui.supportModal.hidden = false;
  ui.supportModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('support-modal-open');
  requestAnimationFrame(() => (studioGate ? ui.supportContinueStudioButton : ui.supportModalCloseButton)?.focus());
}
"""
popup_js = replace_once(popup_js, old_show, new_show, "showSupportPrompt")

popup_js = replace_once(
    popup_js,
    "  supportModalAutomatic = false;\n  if (ui.supportModal) {",
    "  supportModalAutomatic = false;\n  supportModalStudioGate = false;\n  if (ui.supportContinueStudioButton) ui.supportContinueStudioButton.hidden = true;\n  if (ui.supportLaterButton) ui.supportLaterButton.hidden = false;\n  if (ui.supportModal) {",
    "close support reset",
)

old_confirm = """async function confirmSupportLocally() {
  const current = await readSupportPromptState();
  await writeSupportPromptState({
    ...current,
    permanentlyDismissed: true,
    supporterConfirmedAt: Date.now(),
    nextPromptAt: null
  });
  await closeSupportPrompt({ snooze: false });
  setHint('Thank you for supporting SonkuPik. This reminder is disabled on this Chrome profile.');
}
"""
new_confirm = """async function confirmSupportLocally() {
  const shouldOpenStudio = supportModalStudioGate;
  const current = await readSupportPromptState();
  await writeSupportPromptState({
    ...current,
    permanentlyDismissed: true,
    supporterConfirmedAt: Date.now(),
    nextPromptAt: null
  });
  await closeSupportPrompt({ snooze: false });
  setHint('Thank you for supporting SonkuPik. This reminder is disabled on this Chrome profile.');
  if (shouldOpenStudio) await openStudioPanel();
}

async function openStudioPanel() {
  return sendMessage({ target: 'background', type: 'OPEN_STUDIO' }).catch((error) => setHint(error.message));
}

async function openStudioWithSupportPrompt() {
  const current = await readSupportPromptState().catch(() => ({}));
  if (current.permanentlyDismissed) return openStudioPanel();
  showSupportPrompt({ automatic: false, studioGate: true });
}

async function continueToStudio() {
  await closeSupportPrompt({ snooze: false });
  await openStudioPanel();
}
"""
popup_js = replace_once(popup_js, old_confirm, new_confirm, "confirm support block")
write("src/popup/popup.js", popup_js)

popup_css = read("src/popup/popup.css")
popup_css += """

.support-continue-studio {
  width: 100%;
  min-height: 42px;
  height: auto;
  padding: 9px 12px;
}
.support-continue-studio[hidden] { display: none !important; }
.support-modal-actions button[hidden] { display: none !important; }
"""
write("src/popup/popup.css", popup_css)

# Add regression test and wire it into package scripts.
test = r"""import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const presetsModule = await import(`${pathToFileURL(path.join(root, 'src/shared/presets.js')).href}?v=${Date.now()}`);
const presets = presetsModule.FACTORY_PRESETS;
const primary = presetsModule.PRIMARY_MASTER_PRESET_IDS;
const flagship = presets.find((preset) => preset.id === 'default');
assert.equal(flagship?.name, 'Mas Ari Signature');

const expected = [
  ['dangdut-mantap', 'Dangdut Mantap'],
  ['kpop-nikmat', 'K-Pop Nikmat'],
  ['hard-rock', 'Hard Rock'],
  ['blues-asik', 'Blues Asik'],
  ['pop-indonesia', 'Pop Indonesia'],
  ['edm-santai', 'EDM Santai'],
  ['jazz-hangat', 'Jazz Hangat'],
  ['akustik-intim', 'Akustik Intim']
];
for (const [id, name] of expected) {
  const preset = presets.find((candidate) => candidate.id === id);
  assert.ok(preset, `missing ${id}`);
  assert.equal(preset.name, name);
  assert.ok(primary.includes(id), `${id} must be visible in primary preset lists`);
  assert.ok(Number(preset.output.outputGain) < Number(flagship.output.outputGain), `${name} must be quieter than flagship`);
  assert.ok(Number(preset.output.limiterDrive) < Number(flagship.output.limiterDrive), `${name} limiter drive must be calmer`);
  assert.ok(Number(preset.color.mix) < Number(flagship.color.mix), `${name} color mix must be calmer`);
}

const popupHtml = read('popup.html');
const popupJs = read('src/popup/popup.js');
assert.match(popupHtml, /supportContinueStudioButton/);
assert.match(popupHtml, /Continue to Studio/);
assert.match(popupJs, /openStudioWithSupportPrompt/);
assert.match(popupJs, /showSupportPrompt\(\{ automatic: false, studioGate: true \}\)/);
assert.match(popupJs, /if \(current\.permanentlyDismissed\) return openStudioPanel\(\)/);
assert.match(popupJs, /supportModalStudioGate/);
assert.match(popupJs, /Studio remains fully free/);
assert.doesNotMatch(popupJs, /setTimeout\([^)]*openStudio|paymentStatus|verifyPayment|fetch\s*\(/);
console.log('Signature preset and Studio support gate smoke test passed.');
"""
write("scripts/smoke_signature_presets.mjs", test)

package = read("package.json")
package = package.replace(" && node scripts/smoke_support_prompt.mjs\"", " && node scripts/smoke_support_prompt.mjs && node scripts/smoke_signature_presets.mjs\"")
package = package.replace('    "test:support-prompt": "node scripts/smoke_support_prompt.mjs"', '    "test:support-prompt": "node scripts/smoke_support_prompt.mjs",\n    "test:signature-presets": "node scripts/smoke_signature_presets.mjs"')
write("package.json", package)

changelog = read("CHANGELOG.md")
entry = """## [0.3.110] - 2026-07-19

### Added

- Eight calmer genre presets derived from the flagship Mas Ari tuning: Dangdut Mantap, K-Pop Nikmat, Hard Rock, Blues Asik, Pop Indonesia, EDM Santai, Jazz Hangat, and Akustik Intim.
- Optional QRIS interstitial before opening Studio, with an immediate Continue to Studio action and no payment requirement.
- Regression coverage for flagship naming, genre preset loudness hierarchy, and Studio support flow.

### Changed

- Renamed the default flagship preset from MasAri to Mas Ari Signature.
- Users who locally confirm support bypass the Studio QRIS interstitial on the current Chrome profile.

"""
changelog = replace_once(changelog, "## [Unreleased]\n\n", "## [Unreleased]\n\n" + entry, "changelog insertion")
write("CHANGELOG.md", changelog)

write("RELEASE_AUDIT_0.3.110.md", """# ArSonKuPik v0.3.110 Release Audit

## Scope

- Renames the flagship preset to Mas Ari Signature.
- Adds eight lower-output genre derivatives while preserving the flagship tonal DNA.
- Shows the optional local QRIS modal before Studio and always provides an immediate Continue to Studio button.
- Locally confirmed supporters bypass the Studio interstitial on the current Chrome profile.

## Safety principles

- No payment verification, server, webhook, account, analytics, or transaction tracking.
- No audio feature lock, countdown, forced waiting period, or reduced DSP quality.
- No permission or host-permission expansion.
- Audio engine routing remains unchanged from v0.3.109.

## Release gate

Run the complete repository checks, deterministic package build, ZIP integrity and checksum validation, inspect the preset hierarchy, and manually verify QRIS -> Continue to Studio in Chrome before Web Store upload.
""")

# Remove this temporary patch script from the resulting product branch.
(ROOT / "scripts/apply_v03110.py").unlink()
print("Applied v0.3.110 preset and Studio support changes")
