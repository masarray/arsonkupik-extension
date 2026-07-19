# ArSonKuPik v0.3.110 Release Audit

## Scope

- Renames the flagship preset to Mas Ari Signature.
- Adds eight lower-output genre derivatives while preserving the flagship tonal DNA.
- Shows the optional local QRIS modal before Studio and always provides an immediate Continue to Studio button.
- Locally confirmed supporters bypass the Studio interstitial on the current Chrome profile.

## Preset hierarchy

- Flagship output: `-0.55 dB`, limiter drive `0.76`, harmonic color mix `30.5`.
- Dangdut Mantap: `-1.55 dB`.
- K-Pop Nikmat: `-1.72 dB`.
- Hard Rock: `-1.92 dB`.
- Blues Asik: `-1.82 dB`.
- Pop Indonesia: `-1.62 dB`.
- EDM Santai: `-1.95 dB`.
- Jazz Hangat: `-1.88 dB`.
- Akustik Intim: `-1.78 dB`.

Every derivative also uses lower limiter drive and lower harmonic color mix than Mas Ari Signature.

## Safety principles

- No payment verification, server, webhook, account, analytics, or transaction tracking.
- No audio feature lock, countdown, forced waiting period, or reduced DSP quality.
- No permission or host-permission expansion.
- Audio engine routing remains unchanged from v0.3.109.
- `Continue to Studio` is immediately available and requires no payment or confirmation.

## Final CI artifact

- Runtime archive: `ArSonKuPik-v0.3.110-chrome-web-store.zip`
- Runtime files: 27
- Archive size: 455,946 bytes
- SHA-256: `85c3e4ad7a4ab853a7935fb425e4e9fcb109b5601f45f93489ba3511cac2c3ca`
- ZIP integrity: passed
- JavaScript syntax: passed
- Legacy `MasAri` runtime labels: none
- Remote code and network APIs: none
- Permissions: `activeTab`, `tabCapture`, `offscreen`, `storage`
- Host permissions: none

## Remaining manual gate

Verify the QRIS layout and scan quality in Chrome, then test `Open Studio Panel -> Continue to Studio`, locally confirmed supporter bypass, preset switching, and normal audio playback before Web Store submission.
