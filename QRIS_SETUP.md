# QRIS Support Setup

ArSonKuPik accepts only a valid static merchant QRIS issued by an authorized provider. A payment QR must never be fabricated, reconstructed from text, or manually redrawn from its decoded payload.

## Current production QRIS

- Merchant: `SONKUPIK, AUDIO DEVELOPER, DIGITAL & KREATIF`
- NMID: `ID1026551401775`
- Merchant city: `BOGOR`
- Verification date: `2026-07-18`
- Web PNG SHA-256: `832e363510443475bdc45062a2fd3156516957d0ac118f846c02ffe71bbbe0c6`

The production image is a QR-only crop derived directly from the provider-issued sheet. Its complete quiet zone is preserved and it was independently decoded after web optimization. It is embedded locally in `docs/support-config.js` as a PNG data URI, so the page makes no external image request.

## Replace or reactivate the QRIS

1. Obtain an official **static merchant QRIS** from a bank, payment service provider, or other authorized provider.
2. Scan the provider image and confirm the merchant name, NMID, city, and payment destination.
3. Prepare a square PNG containing the QR and its complete quiet zone. Do not stretch, redraw, overlay, recolor, or regenerate the QR from decoded text.
4. Scan the final PNG using at least two banking or e-wallet applications.
5. Run:

```bash
python3 scripts/configure_qris.py \
  --image "/path/to/verified-qris-web.png" \
  --merchant-name "THE EXACT MERCHANT NAME" \
  --merchant-city "CITY" \
  --nmid "EXACT NMID" \
  --verified-date "YYYY-MM-DD"
```

The script validates the PNG, computes its SHA-256, embeds the bytes into the first-party support configuration, enables indexing, displays the NMID, and adds the support page to the sitemap.

Then run:

```bash
npm run check
npm run release:check
npm run package
```

Confirm the generated extension ZIP contains no `qris`, `dukung`, `docs`, or support-page asset.

## Disable support payments

```bash
python3 scripts/configure_qris.py --disable
```

This disables the QRIS panel, restores `noindex`, and removes the support-page entry from the sitemap. It does not alter the extension runtime.

## Security rules

- Never commit API keys, merchant secrets, bank credentials, transaction exports, phone numbers, or identity documents.
- Do not add analytics, tracking parameters, auto-redirects, payment-status checks, or payment confirmation claims.
- Support must never unlock, restrict, or modify core extension functionality.
- Replace or disable the QRIS immediately if the provider reissues or revokes it.
- Pin the active image SHA-256 in the support smoke test and activation audit.
- Keep QRIS configuration under `docs/`; it must not enter the Chrome Web Store runtime ZIP.

A documentation-only QRIS update does not require a new extension version, provided the runtime ZIP remains byte-identical to the published release.
