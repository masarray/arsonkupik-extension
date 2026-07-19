# Chrome Web Store Listing — ArSonKuPik 0.3.111

## Product name

**ArSonKuPik**

## Short description

Professional local browser audio enhancer with parametric EQ, dynamics, harmonics, stereo width, presets, and limiting.

## Detailed description

ArSonKuPik turns browser playback into a focused real-time mastering chain.

Shape music, video, podcasts, and other audible browser tabs with an interactive parametric equalizer, stereo-linked compressor, harmonic color controls, multiband stereo width, output gain, limiter protection, metering, and carefully voiced presets.

### Main features

- Interactive parametric EQ with multiple filter types and slopes
- Pre/post spectrum monitoring and stereo input/output meters
- Stereo-linked compressor with gain-reduction display
- Harmonic body, presence, air, and saturation controls
- Frequency-aware stereo-width shaping with correlation feedback
- Output gain, clipping feedback, and limiter protection
- Direct playback through the browser and operating system default audio output
- Master and module presets, A/B comparison, undo/redo, and custom local presets
- ECO, STABLE, and TURBO processing modes
- English and Bahasa Indonesia interface with a manual language selector

### Privacy-first design

ArSonKuPik processes the selected tab's audio locally in the browser. It does not record or upload audio, does not include analytics or advertising, and declares no host permissions. Settings, custom presets, consent metadata, manual language choice, and optional normalized per-site preferences are stored locally in the user's Chrome profile.

Before first use, ArSonKuPik explains local audio processing and storage and requires **Accept & Continue**. Audio capture begins only after the user starts Enhance.

### Optional support link

A small **Support ArSonKuPik** button opens the project's first-party Indonesia QRIS support page only after an explicit click. There is no automatic reminder, Studio gate, advertising, tracking, payment SDK, or feature unlock. All core functionality remains free.

## Recommended category

Tools

## Languages

- English
- Indonesian

## Permission justifications

### activeTab

Limits user-triggered actions to the tab currently selected by the user.

### tabCapture

Obtains the selected tab's audio stream after the user chooses Start Enhance.

### offscreen

Keeps the local Web Audio processing graph running after the popup closes.

### storage

Saves audio settings, custom presets, consent metadata, manual language choice, and normalized per-site preferences locally. Users can clear site preferences separately or reset all local data.

## Required public URLs

- Website: `https://masarray.github.io/arsonkupik-extension/`
- Support: `https://masarray.github.io/arsonkupik-extension/support.html`
- Privacy policy: `https://masarray.github.io/arsonkupik-extension/privacy.html`
- Source and releases: `https://github.com/masarray/arsonkupik-extension`

## Suggested screenshots

1. Full Studio interface with the complete mastering chain.
2. Parametric EQ and spectrum workflow.
3. Compressor, harmonic color, and stereo width modules.
4. Popup start and preset workflow with the language selector.
5. Privacy statement explaining local processing and no host permissions.
