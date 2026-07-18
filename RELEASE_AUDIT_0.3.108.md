# ArSonKuPik v0.3.108 Release Audit

## Confirmed root cause

Chromium treats `AudioNode.disconnect(null)` as the zero-argument overload and removes every outgoing connection. The headless monitoring cleanup passed null analyser destinations before Studio monitoring nodes existed, disconnecting both the captured media source and the final output mixer immediately after startup.

## Permanent correction

- Destination-specific disconnects now run only when both source and destination nodes exist.
- The raw continuity route and processed route remain connected during headless playback.
- A functional graph test emulates Chromium's null-disconnect semantics and verifies a non-zero path from captured tab audio to `AudioContext.destination`.
- Version and release metadata are aligned to v0.3.108.

## Release gate

Run `npm run release:check`, build the deterministic archive, verify ZIP integrity and checksum, and test real Chrome tab capture before Web Store submission.
