# Release Audit 0.3.106

## Scope

This release closes the cross-context state and stable-release integrity findings:

- centralizes state mutations in one service-worker scheduler;
- coalesces rapid popup and Studio patches before persistence;
- orders presets, start/stop, reset, capture lifecycle, and offscreen notifications;
- ignores stale offscreen notifications;
- makes stable release assets immutable;
- aligns Chrome Web Store listing and privacy submission guidance.

## Required checks

- `npm run check`
- `npm run release:check`
- global state scheduler stress test
- deterministic package build
- ZIP integrity and SHA-256 verification
- manual Chrome popup + Studio playback endurance test

## Runtime privacy

Permissions remain limited to `activeTab`, `tabCapture`, `offscreen`, and `storage`. No host permissions, microphone access, telemetry, remote runtime code, output-device routing, or cloud audio path are introduced.
