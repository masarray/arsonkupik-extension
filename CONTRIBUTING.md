# Contributing to ArSonKuPik

Thank you for helping improve ArSonKuPik. The project values focused changes, measurable audio behavior, privacy by design, and a compact interface.

## Contributor agreement

ArSonKuPik is source-available rather than open source. Before submitting a contribution, read [CONTRIBUTOR_LICENSE_AGREEMENT.md](CONTRIBUTOR_LICENSE_AGREEMENT.md).

By opening a pull request and checking the CLA acknowledgement in the pull-request template, you confirm that you accept the agreement for the submitted contribution. Do not submit code, assets, or documentation when you do not have authority to grant those rights.

## Before opening a pull request

1. Create a focused branch from the latest default branch.
2. Keep DSP, UI, privacy, and repository-maintenance changes separate when practical.
3. Run `npm run check` and `npm run release:check` when release metadata changes.
4. Test the unpacked extension in the supported Chrome version.
5. Verify first-use consent, start, stop, bypass, preset switching, Studio opening, output fallback, and deletion controls.
6. Describe audible changes with a repeatable source and listening conditions.
7. Confirm that every new asset has documented ownership or redistribution rights.

## Engineering guidelines

- Do not add remote scripts, remote styles, analytics, telemetry, advertising, microphone access, or host permissions.
- Preserve local-only audio processing and the service-worker privacy-consent gate.
- Store only the minimum tab or site information needed for a user-facing feature.
- Normalize new state fields in the shared preset/state layer.
- Avoid unnecessary render loops, polling, and audio-node recreation.
- Keep controls compact and accessible; include labels, keyboard behavior, and visible focus states.
- Do not commit signing keys, private Web Store credentials, licensed font binaries, copied product photography, or unverified third-party assets.

## Commit style

Use concise imperative commits, for example:

```text
fix: preserve output route when applying presets
feat: add correlation guard to width engine
docs: clarify Chrome Web Store privacy disclosure
```

## Pull-request evidence

Include screenshots for interface changes and explain how you tested DSP changes. Privacy-sensitive changes must identify the data handled, purpose, retention, deletion path, and permission impact. A pull request may be held until behavior is reproducible and privacy boundaries remain intact.
