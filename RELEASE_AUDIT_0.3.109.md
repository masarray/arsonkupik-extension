# ArSonKuPik v0.3.109 Release Audit

## Scope

- Adds an optional static QRIS support dialog inside the popup.
- Starts the 90-day clock only after the first successful Enhance session.
- Allows a 30-day reminder delay or permanent local dismissal after self-confirmed support.
- Keeps all audio features available regardless of support status.

## Privacy and security

- No payment API, account, webhook, transaction lookup, analytics, or remote image.
- Support timestamps and dismissal state remain in `chrome.storage.local`.
- The extension cannot determine whether a payment occurred.
- QRIS SVG includes auditable payload metadata and is byte-pinned by CI.

## QRIS identity

- Merchant: Sonkupik, Audio Developer
- NMID: ID1026551401775
- City: BOGOR
- SVG SHA-256: `79339bcc248eafbfe5db259779bce90f60add55bbc80ce2ee8d82d5b9665d325`
- Independent SVG render/decode: passed

## Final CI artifact

- Runtime archive: `ArSonKuPik-v0.3.109-chrome-web-store.zip`
- Runtime files: 27
- Archive size: 453,556 bytes
- SHA-256: `776362df878553e69f65d79296296d0845f47f6133ee2531534455b35ee8db38`
- ZIP integrity: passed
- JavaScript syntax: passed
- Remote code/network APIs: none
- Permissions unchanged: `activeTab`, `tabCapture`, `offscreen`, `storage`
- Host permissions: none
- Audio engine and service-worker routing files: byte-identical to v0.3.108

## Manual gate

Test the popup on a clean profile, verify immediate manual opening from Support, simulate the 90-day timestamp in local storage, scan QRIS with at least two banking applications, and confirm all audio functions remain unaffected.
