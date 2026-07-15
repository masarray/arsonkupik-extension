# Changelog

All notable project changes are documented here. The format follows Keep a Changelog principles, and release tags use semantic version-compatible identifiers where practical.

## [Unreleased]

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

[Unreleased]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.102...HEAD
[0.3.102]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.101...v0.3.102
[0.3.101]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.100...v0.3.101
[0.3.100]: https://github.com/masarray/arsonkupik-extension/releases/tag/v0.3.100
