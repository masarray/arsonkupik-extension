# ArSonKuPik v0.3.110 Release Audit

## Scope

- Renames the flagship preset to Mas Ari Signature.
- Adds eight lower-output genre derivatives while preserving the flagship tonal DNA.
- Shows the optional local QRIS modal before Studio and always provides an immediate Continue to Studio button.
- Locally confirmed supporters bypass the Studio interstitial on the current Chrome profile.

## Safety principles

- No payment verification, server, webhook, account, analytics, or transaction tracking.
- No audio feature lock, countdown, forced waiting period, or reduced DSP quality.
- No permission or host-permission expansion.
- Audio engine routing remains unchanged from v0.3.109.

## Release gate

Run the complete repository checks, deterministic package build, ZIP integrity and checksum validation, inspect the preset hierarchy, and manually verify QRIS -> Continue to Studio in Chrome before Web Store upload.
