# ArSonKuPik v0.3.108 Release Audit

## Confirmed root cause

Chromium treats `AudioNode.disconnect(null)` as the zero-argument overload and removes every outgoing connection. The headless monitoring cleanup passed null analyser destinations before Studio monitoring nodes existed, disconnecting both the captured media source and the final output mixer immediately after startup.

The behavior was reproduced independently with Chromium `OfflineAudioContext`: a source connected to two live branches rendered `0.75` before `disconnect(null)` and complete silence (`0`) afterward.

## Permanent correction

- Destination-specific disconnects now run only when both source and destination nodes exist.
- Processing-graph cleanup also guards its destination before disconnecting.
- The raw continuity route and processed route remain connected during headless playback.
- A functional graph test emulates Chromium's destructive null-disconnect semantics and verifies a non-zero path from captured tab audio to `AudioContext.destination`.
- Headless regression checks now require all four monitoring endpoint guards.
- Version and release metadata are aligned to v0.3.108.

## Final CI artifact

- Runtime archive: `ArSonKuPik-v0.3.108-chrome-web-store.zip`
- Runtime files: 26
- Archive size: 448,619 bytes
- SHA-256: `932951157865628a96584b923ca0765eec453db0a8e34966d7bf40c4fcfbc0e1`
- ZIP integrity: passed
- JavaScript syntax: 10/10 passed
- Actual `disconnect(null)` / `disconnect(undefined)` calls: none
- Temporary patch/workflow files in runtime package: none
- Permissions: `activeTab`, `tabCapture`, `offscreen`, `storage`
- Host permissions: none

## Remaining manual gate

Test real Chrome tab capture using a clean profile: start Enhance, confirm immediate audible playback, switch presets, open/close Studio, toggle bypass, stop/start capture, and run a 30–60 minute endurance session before Web Store submission.
