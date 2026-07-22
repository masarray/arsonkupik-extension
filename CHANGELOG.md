# Changelog

All notable project changes are documented here. The format follows Keep a Changelog principles, and release tags use semantic version-compatible identifiers where practical.

## [Unreleased]

## [0.3.112] - 2026-07-22

### Fixed

- Removed the global live-localization MutationObserver that reprocessed Studio graphs, knobs, meters, SVG nodes, and frequently changing status attributes.
- Made Popup and Studio runtime imports independent from localization startup so a language-catalog failure can no longer block the extension UI.
- Added visible startup watchdogs that verify real preset, graph, and control construction and provide a reload action instead of leaving a silent half-rendered shell.

### Changed

- Localization now updates only explicitly annotated `data-i18n` text and attributes once per page load.
- Added regression checks that reject blocking localization or reintroduction of a whole-document MutationObserver.

## [0.3.111] - 2026-07-19

### Added

- Deterministic Web Store artifact validation covering ZIP root structure, bilingual locale files, manifest message resolution, privacy permissions, and packaged support behavior.
- CI extraction checks that verify `manifest.json` and both locale catalogs exist at the release ZIP root.

### Changed

- Voluntary QRIS support is now available only through an explicit Support button that opens the first-party page; automatic reminders and the Studio interstitial were removed.
- Chrome Web Store privacy declarations now disclose transient local tab-audio handling as Website content and limited selected-tab metadata handling.
- Public privacy and listing copy now match system-default playback and the bilingual runtime.

### Fixed

- Included `_locales/en` and `_locales/id` in the Chrome Web Store package.
- Shortened the Indonesian manifest description to remain within Chrome's 132-character limit.

## [0.3.110] - 2026-07-19

### Added

- Eight calmer genre presets derived from the flagship Mas Ari tuning: Dangdut Mantap, K-Pop Nikmat, Hard Rock, Blues Asik, Pop Indonesia, EDM Santai, Jazz Hangat, and Akustik Intim.
- Optional QRIS interstitial before opening Studio, with an immediate Continue to Studio action and no payment requirement.
- Regression coverage for flagship naming, genre preset loudness hierarchy, and Studio support flow.

### Changed

- Renamed the default flagship preset from MasAri to Mas Ari Signature.
- Users who locally confirm support bypass the Studio QRIS interstitial on the current Chrome profile.

## [0.3.109] - 2026-07-18

### Added

- Optional static QRIS support dialog inside the popup, available immediately from the Support button and shown automatically only after 90 days from the first successful Enhance session.
- Local-only reminder controls: remind again after 30 days or permanently hide the prompt on the current Chrome profile after the user confirms support.
- Scan-verified local QRIS SVG for `Sonkupik, Audio Developer`, NMID `ID1026551401775`, with no remote image or payment API.
- Support-prompt regression checks covering timing, local persistence, disclosure copy, QR payload metadata, and absence of transaction tracking.

### Changed

- Voluntary support remains completely optional and never unlocks, limits, or changes audio features.

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
