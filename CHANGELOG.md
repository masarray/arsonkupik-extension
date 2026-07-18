# Changelog

All notable project changes are documented here. The format follows Keep a Changelog principles, and release tags use semantic version-compatible identifiers where practical.

## [Unreleased]

## [0.3.108] - 2026-07-18

### Added

- Functional Web Audio route regression test that emulates Chromium's destructive `disconnect(null)` behavior and proves a non-zero path remains from captured tab audio to `AudioContext.destination`.

### Fixed

- Prevented inactive Studio-monitoring cleanup from calling `AudioNode.disconnect()` with null destinations, which disconnected the complete tab-capture and speaker route and caused immediate total silence after Enhance.
- Guarded processing-graph destination disconnects so future partial-startup states cannot accidentally invoke the zero-argument disconnect overload.

## [0.3.107] - 2026-07-18

### Added

- Runtime-startup regression test covering the offscreen silent-meter helper and popup preset selector styling.

### Fixed

- Restored the missing `createSilentMeters()` helper in the offscreen audio engine, preventing startup from failing before tab capture begins.
- Restored the complete Quick Preset selector CSS block so the popup dropdown uses the intended full-width premium dark styling.


### Added

- Verified Indonesia merchant QRIS support for `SONKUPIK, AUDIO DEVELOPER, DIGITAL & KREATIF`, hosted only on the first-party GitHub Pages support page.
- Byte-pinned support smoke test and QRIS activation audit covering merchant identity, NMID, local image bytes, indexing, and runtime-package isolation.
- Chrome Web Store submission checklist for the audited v0.3.106 runtime package.

### Changed

- QRIS web presentation now uses a scan-verified PNG derived directly from the provider-issued QRIS sheet and embedded locally without a remote image request.
- QRIS replacement tooling now embeds and hashes a verified square PNG instead of copying an unchecked public asset.

## [0.3.106] - 2026-07-17

### Added

- Service-worker global state-command scheduler that serializes popup, Studio, preset, lifecycle, and offscreen state mutations.
- Cross-context stress test covering coalescing, command barriers, and single-writer persistence.

### Changed

- Rapid state patches are debounced and coalesced before the service worker persists one final normalized state.
- `UPDATE_STATE` now returns lightweight acknowledgement metadata instead of rebuilding the complete preset-bearing state response.
- Stable GitHub release assets are immutable and cannot be overwritten with `--clobber`.

### Fixed

- Prevented popup and Studio contexts from writing extension state concurrently.
- Ignored stale offscreen state notifications using monotonic update timestamps.
- Updated Chrome Web Store listing guidance to remove obsolete output-routing and output-route storage claims.

## [0.3.105] - 2026-07-17

### Added

- Serialized latest-value engine-state update queue with nested-patch coalescing and regression coverage.
- Release metadata guard that requires manifest, package, descriptor, tag, title, and changelog alignment.

### Changed

- GitHub Pages and core checkout/setup-node actions are pinned to verified release commits.
- Website output copy now matches direct system-default playback.

### Fixed

- Prevented rapid knob gestures from creating overlapping storage and offscreen update operations.
- Synchronized the release descriptor and public version metadata with the current runtime.

## [0.3.104] - 2026-07-16

### Changed

- Playback now always uses the browser system-default `AudioContext.destination`; the unfinished output-device selector and routing state were removed.
- Studio analyser, correlation, FFT, and metering nodes are created only while Studio is visible and are destroyed when monitoring stops.
- The steady-state playback chain no longer places analyser nodes in series with audible audio.

### Fixed

- Removed the hidden media-element re-clock path that could produce long-session crackle or drift.
- Topology changes now crossfade temporarily to the raw path before reconnecting, reducing ticks and short dropouts.
- Headless playback now runs without Studio polling, RTA, correlation, stereo-band meters, or adaptive timers.

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

## [0.3.102] - 2026-07-15

### Added

- User-initiated **Support ArSonKuPik** entry points in the popup and Studio.
- Indonesia-first QRIS support page with voluntary-support disclosure, no tracking, and no paywall.
- Safe QRIS configuration gate, setup documentation, GitHub funding link, and release validation.
- Automated support-flow smoke test.

### Changed

- Privacy and Chrome Web Store disclosures now explain the optional external support page.
- Project website navigation and README now distinguish technical support from voluntary development support.


## [0.3.101] - 2026-07-15

### Added

- Explicit first-use local-processing privacy notice with background-enforced consent.
- Popup controls to clear per-site preferences independently or reset all local extension data.
- Chrome Web Store privacy-disclosure checklist and Limited Use documentation.
- Contributor License Agreement and pull-request acceptance record.
- Asset attribution, third-party notice, and trademark documentation.
- Independent, non-sponsored hardware-selection guide without product photography or affiliate links.

### Changed

- Output-device selection now uses the browser's user-initiated speaker chooser when available and otherwise falls back to System Default.
- Per-site preferences now store only a normalized hostname and minimum preference data; saved tab titles and tab identifiers were removed.
- Privacy policy and Web Store listing now disclose local hostname, output-route, consent, retention, and deletion behavior.

### Removed

- The broad `contentSettings` permission and all runtime use of `chrome.contentSettings`.
- The bundled third-party-style SC220 MKII recommendation poster and product-specific promotion.

## [0.3.100] - 2026-07-15

### Added

- Manifest V3 browser audio-enhancement extension.
- Popup workflow for capture, presets, and output routing.
- Full Studio interface with EQ, compressor, harmonic color, stereo width, limiter, meters, A/B, history, and custom presets.
- Local offscreen Web Audio processing and local state storage.
- Professional GitHub repository documentation and governance files.
- Automated repository validation and deterministic extension packaging.
- GitHub Pages landing site with English and Indonesian content.
- SEO metadata, canonical URLs, structured data, sitemap, robots file, and social-sharing image.

[Unreleased]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.107...HEAD
[0.3.107]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.106...v0.3.107
[0.3.106]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.105...v0.3.106
[0.3.105]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.102...v0.3.105
[0.3.104]: https://github.com/masarray/arsonkupik-extension/pull/12
[0.3.103]: https://github.com/masarray/arsonkupik-extension/pull/11
[0.3.102]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.101...v0.3.102
[0.3.101]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.100...v0.3.101
[0.3.100]: https://github.com/masarray/arsonkupik-extension/releases/tag/v0.3.100
