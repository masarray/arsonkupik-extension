# QRIS Support Setup

The repository deliberately ships with QRIS disabled. A valid payment QR must be issued by an authorized merchant QRIS provider; it must never be fabricated or generated from ordinary text.

## Activate the support page

1. Obtain an official **static merchant QRIS** from a bank, payment service provider, or other authorized provider.
2. Confirm that scanning it displays the intended merchant name. Do not use a temporary or expiring dynamic QR.
3. Export a clean square PNG of at least 600 × 600 pixels; 1200 × 1200 or larger is preferred.
4. Run the guarded configuration command:

```bash
python3 scripts/configure_qris.py \
  --image "/path/to/official-qris.png" \
  --merchant-name "THE EXACT NAME SHOWN BY QRIS" \
  --merchant-city "OPTIONAL CITY"
```

The script validates the PNG, copies it to `docs/assets/qris-arsonkupik.png`, enables the first-party support config, changes the page from `noindex` to indexable, and adds the canonical URL to `sitemap.xml`.

5. Run `npm run release:check`.
6. Preview the GitHub Pages site and scan the code using at least two different banking/e-wallet applications.
7. Verify the merchant name and destination before publishing.

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
- Keep the old image out of release history when it is invalid or points to the wrong merchant.

The extension does not require a new release when only the GitHub Pages QRIS image/configuration changes.
