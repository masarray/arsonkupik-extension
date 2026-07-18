# QRIS Support Setup

The repository accepts only a valid payment QR issued by an authorized merchant QRIS provider. It must never be fabricated, redrawn, reconstructed from ordinary text, or altered in a way that changes the QR geometry.

## Activate the support page

1. Obtain an official **static merchant QRIS** from a bank, payment service provider, or other authorized provider.
2. Confirm that scanning it displays the intended merchant name and destination. Do not use a temporary or expiring dynamic QR.
3. Export the complete provider-issued artwork as PNG. The shortest side must be at least 600 pixels. A portrait provider sheet is allowed and should be preserved when it contains official merchant, NMID, QRIS, or GPN information.
4. Do not crop into the QR quiet zone, stretch, redraw, sharpen, overlay, recolor, or generate a replacement QR.
5. Run the guarded configuration command:

```bash
python3 scripts/configure_qris.py \
  --image "/path/to/official-qris.png" \
  --merchant-name "THE EXACT NAME SHOWN BY QRIS" \
  --merchant-city "OPTIONAL CITY"
```

The script validates the PNG dimensions, copies it to `docs/assets/qris-arsonkupik.png`, enables the first-party support config, changes the page from `noindex` to indexable, and adds the canonical URL to `sitemap.xml`.

6. Run `npm run release:check`.
7. Preview the GitHub Pages site and scan the displayed image using at least two different banking/e-wallet applications.
8. Verify the merchant name, NMID, city, and destination before publishing.

To revoke or replace the QRIS safely:

```bash
python3 scripts/configure_qris.py --disable
```

This removes the image, disables the page, restores `noindex`, and removes its sitemap entry.

## Security rules

- Never commit API keys, merchant secrets, bank credentials, transaction exports, phone numbers, or identity documents.
- Do not add tracking parameters, analytics, auto-redirects, or payment confirmation claims.
- Do not advertise supporter-only core functionality unless a separately reviewed licensing system is intentionally introduced.
- Replace the image and update `lastVerified` immediately if the provider reissues or revokes the QRIS.
- Keep the old image out of the active site when it is invalid or points to the wrong merchant.
- Keep the QRIS asset under `docs/`; it must not be included in the Chrome extension runtime ZIP.

The extension does not require a new runtime release when only the GitHub Pages QRIS image or support configuration changes.
