# ArSonKuPik v0.3.102 Release Audit

## Scope

Indonesia-first voluntary development support, implemented without changing audio processing, permissions, capture behavior, or the P0 privacy model.

## Implemented controls

- Support links open only after an explicit click in the popup or Studio.
- The destination is the first-party GitHub Pages URL `/id/dukung.html`.
- No new Chrome permission or host permission was added.
- No analytics, tracking pixel, advertising SDK, affiliate system, payment SDK, or transaction callback was added.
- Core features remain available without payment.
- The default repository does not contain or fabricate a QRIS payment code.
- QRIS activation requires an official merchant image and an explicit configuration flag.
- The validator rejects an enabled configuration when the image is missing.
- Privacy, Chrome Web Store, README, funding, and setup documentation were updated.

## Required owner action before accepting support

Follow `QRIS_SETUP.md`, verify the official static merchant QRIS using multiple payment applications, set the exact merchant name, and then enable `qrisEnabled`. The public page remains in a safe “being prepared” state until that action is complete.

## Validation evidence

- `npm run release:check`: passed.
- Privacy consent and deletion smoke test: passed.
- User-initiated support flow smoke test: passed.
- QRIS activation/deactivation integration test using a temporary 600 × 600 test PNG: passed.
- Disabled-by-default SEO state: `noindex` and absent from sitemap.
- Enabled-state guard: requires an official PNG, verification date, indexable page, and sitemap entry.
- Chrome Web Store ZIP: `ArSonKuPik-v0.3.102-chrome-web-store.zip`.
- Chrome Web Store ZIP SHA-256: `439f5032f8665b42bdf637a97cfd7953c4fbaf14acab150c6efe862ea506e690`.
