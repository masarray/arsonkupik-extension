# Release Audit 0.3.105

## Scope

This release closes the final audit findings before Chrome Web Store submission:

- serializes and coalesces rapid engine-state updates;
- aligns manifest, package, changelog, descriptor, and release tag metadata;
- corrects system-default playback copy;
- pins GitHub Actions to verified commits;
- adds regression tests for update ordering and release metadata.

## Required checks

- `npm run check`
- `npm run release:check`
- deterministic package build
- ZIP integrity and SHA-256 verification
- manual Chrome playback stress test before Web Store submission

## Runtime privacy

Permissions remain limited to `activeTab`, `tabCapture`, `offscreen`, and `storage`. No host permissions, microphone permission, telemetry, remote runtime code, or cloud audio path are introduced.
