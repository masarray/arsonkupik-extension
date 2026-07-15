# Chrome Web Store Listing Draft

## Product name

**ArSonKuPik**

## Short description

Professional local browser audio enhancer with parametric EQ, dynamics, harmonics, stereo width, limiting, presets, and output routing.

## Detailed description

ArSonKuPik turns browser playback into a focused real-time mastering chain.

Shape music, video, and other audible browser tabs with an interactive parametric equalizer, stereo-linked compressor, harmonic color controls, multiband stereo width, output gain, limiter protection, metering, and carefully voiced presets.

### Main features

- Interactive parametric EQ with multiple filter types and slopes
- Pre/post spectrum monitoring and stereo input/output meters
- Stereo-linked compressor with gain-reduction display
- Harmonic body, presence, air, and saturation controls
- Frequency-aware stereo-width shaping with correlation feedback
- Output gain, clipping feedback, and limiter protection
- Output-device routing where supported by the browser and operating system
- Master and module presets, A/B comparison, undo/redo, and custom local presets
- ECO and TURBO processing modes

### Privacy-first design

ArSonKuPik processes audio locally in the browser. It does not record or upload audio, does not include analytics or advertising, and does not declare host permissions. Settings, custom presets, consent metadata, output routes, and optional normalized per-site preferences are stored locally in the user's Chrome profile. The extension can derive the selected site's hostname only to restore a user-requested per-site preference.

Before first use, ArSonKuPik explains this local processing and storage and requires the user to choose **Accept & Continue**. Audio capture then begins only after the user selects a tab and starts enhancement.

### Optional support link

ArSonKuPik includes a small optional **Support ArSonKuPik** link that opens the project's public Indonesia QRIS page only after a user click. It does not open automatically, include advertising, track the user, process payment information, or unlock extension features. All core functionality remains free.

## Recommended category

Productivity

## Language

Primary: English

Additional: Indonesian

## Permission justifications

### activeTab

Used to limit user-triggered actions to the tab the user currently selects.

### tabCapture

Required to obtain the selected tab's audio stream after the user chooses Start Enhance.

### offscreen

Required to keep the local Web Audio processing graph running after the popup closes.

### storage

Used to save audio settings, custom presets, consent metadata, output routes, and normalized per-site preferences locally. Users can clear site preferences separately or reset all local data from the popup.

## Required public URLs

- Website: `https://masarray.github.io/arsonkupik-extension/`
- Support: `https://masarray.github.io/arsonkupik-extension/support.html`
- Privacy policy: `https://masarray.github.io/arsonkupik-extension/privacy.html`
- Source and releases: `https://github.com/masarray/arsonkupik-extension`

## Suggested screenshots

1. Full Studio interface with the complete mastering chain.
2. Parametric EQ and spectrum workflow.
3. Compressor, harmonic color, and stereo width modules.
4. Popup start/preset/output workflow.
5. Privacy statement explaining local processing and no host permissions.
