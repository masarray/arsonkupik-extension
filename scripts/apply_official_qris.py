#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import json
import re
from pathlib import Path

ROOT = Path.cwd()
ASSET_B64 = ROOT / '.qris/qris-arsonkupik.jpg.b64'
ASSET = ROOT / 'docs/assets/qris-arsonkupik.jpg'
EXPECTED_SHA256 = '0095ddce62265f7a42795bb75a1077267a0873da75c84b745e23712cf53c4a11'
SUPPORT_URL = 'https://masarray.github.io/arsonkupik-extension/id/dukung.html'


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one occurrence, found {count}: {old[:100]!r}')
    write(path, text.replace(old, new, 1))


def jpeg_dimensions(data: bytes) -> tuple[int, int]:
    if len(data) < 4 or data[:2] != b'\xff\xd8':
        raise ValueError('QRIS asset is not a JPEG')
    offset = 2
    sof_markers = {
        0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
        0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF,
    }
    while offset + 3 < len(data):
        if data[offset] != 0xFF:
            offset += 1
            continue
        while offset < len(data) and data[offset] == 0xFF:
            offset += 1
        if offset >= len(data):
            break
        marker = data[offset]
        offset += 1
        if marker in {0xD8, 0xD9} or 0xD0 <= marker <= 0xD7:
            continue
        if offset + 2 > len(data):
            break
        length = int.from_bytes(data[offset:offset + 2], 'big')
        if length < 2 or offset + length > len(data):
            break
        if marker in sof_markers:
            if length < 7:
                break
            height = int.from_bytes(data[offset + 3:offset + 5], 'big')
            width = int.from_bytes(data[offset + 5:offset + 7], 'big')
            return width, height
        offset += length
    raise ValueError('Unable to read JPEG dimensions')


asset_bytes = base64.b64decode(ASSET_B64.read_text(encoding='ascii'), validate=True)
digest = hashlib.sha256(asset_bytes).hexdigest()
if digest != EXPECTED_SHA256:
    raise RuntimeError(f'Official QRIS SHA-256 mismatch: {digest}')
width, height = jpeg_dimensions(asset_bytes)
if (width, height) != (1090, 1536):
    raise RuntimeError(f'Unexpected official QRIS dimensions: {width}x{height}')
ASSET.parent.mkdir(parents=True, exist_ok=True)
ASSET.write_bytes(asset_bytes)
legacy_png = ROOT / 'docs/assets/qris-arsonkupik.png'
if legacy_png.exists():
    legacy_png.unlink()

write('docs/support-config.js', '''globalThis.ARSONKUPIK_SUPPORT_CONFIG = Object.freeze({
  qrisEnabled: true,
  qrisImage: '../assets/qris-arsonkupik.jpg',
  merchantName: 'Sonkupik, Audio Developer',
  merchantPrintName: 'SONKUPIK, AUDIO DEVELOPER, DIGITAL & KREATIF',
  merchantCity: 'BOGOR',
  merchantNmid: 'ID1026551401775',
  lastVerified: '2026-07-18',
  suggestedAmounts: [10000, 25000, 50000]
});
''')

write('docs/support-page.js', '''(() => {
  'use strict';

  const config = globalThis.ARSONKUPIK_SUPPORT_CONFIG || {};
  const panel = document.querySelector('[data-qris-panel]');
  const pending = document.querySelector('[data-qris-pending]');
  const image = document.querySelector('[data-qris-image]');
  const imageLink = document.querySelector('[data-qris-link]');
  const merchant = document.querySelector('[data-merchant-name]');
  const printName = document.querySelector('[data-merchant-print-name]');
  const city = document.querySelector('[data-merchant-city]');
  const nmid = document.querySelector('[data-merchant-nmid]');
  const verified = document.querySelector('[data-qris-verified]');
  const amounts = document.querySelector('[data-suggested-amounts]');

  const enabled = config.qrisEnabled === true && typeof config.qrisImage === 'string' && config.qrisImage.trim();
  if (merchant) merchant.textContent = config.merchantName || 'Sonkupik, Audio Developer';
  if (printName) {
    printName.textContent = config.merchantPrintName ? `Nama pada lembar QRIS: ${config.merchantPrintName}` : '';
    printName.hidden = !config.merchantPrintName;
  }
  if (city) {
    city.textContent = config.merchantCity ? `Kota merchant: ${config.merchantCity}` : '';
    city.hidden = !config.merchantCity;
  }
  if (nmid) {
    nmid.textContent = config.merchantNmid ? `NMID: ${config.merchantNmid}` : '';
    nmid.hidden = !config.merchantNmid;
  }
  if (verified) {
    verified.textContent = config.lastVerified ? `QRIS terakhir diverifikasi: ${config.lastVerified}` : '';
    verified.hidden = !config.lastVerified;
  }
  if (amounts && Array.isArray(config.suggestedAmounts)) {
    amounts.textContent = config.suggestedAmounts
      .filter((value) => Number.isFinite(Number(value)) && Number(value) > 0)
      .map((value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value)))
      .join(' · ');
  }

  if (enabled && image && panel && pending) {
    image.src = config.qrisImage;
    image.alt = `QRIS resmi merchant ${config.merchantName || 'Sonkupik, Audio Developer'}`;
    if (imageLink) imageLink.href = config.qrisImage;
    image.addEventListener('error', () => {
      panel.hidden = true;
      pending.hidden = false;
      const title = pending.querySelector('strong');
      if (title) title.textContent = 'QRIS belum dapat ditampilkan';
    }, { once: true });
    panel.hidden = false;
    pending.hidden = true;
  }
})();
''')

replace_once(
    'docs/id/dukung.html',
    '<meta name="robots" content="noindex,follow">',
    '<meta name="robots" content="index,follow,max-image-preview:large">',
)
replace_once(
    'docs/id/dukung.html',
    '            <div class="qris-image-frame"><img data-qris-image width="720" height="720" alt=""></div>',
    '''            <div class="qris-image-frame">
              <a data-qris-link href="../assets/qris-arsonkupik.jpg" target="_blank" rel="noopener" aria-label="Buka QRIS resmi dalam resolusi penuh">
                <img data-qris-image width="1090" height="1536" alt="QRIS resmi Sonkupik, Audio Developer" decoding="async">
              </a>
            </div>''',
)
replace_once(
    'docs/id/dukung.html',
    '''            <div class="qris-merchant">
              <span>Pastikan nama merchant sesuai sebelum membayar</span>
              <strong data-merchant-name>ArSonKuPik</strong>
              <small data-merchant-city hidden></small>
              <small data-qris-verified hidden></small>
            </div>
            <p class="qris-amounts">Contoh dukungan: <span data-suggested-amounts>Rp10.000 · Rp25.000 · Rp50.000</span></p>''',
    '''            <div class="qris-merchant">
              <span>Pastikan nama merchant pada aplikasi pembayaran sesuai</span>
              <strong data-merchant-name>Sonkupik, Audio Developer</strong>
              <small data-merchant-print-name hidden></small>
              <small data-merchant-city hidden></small>
              <small data-merchant-nmid hidden></small>
              <small data-qris-verified hidden></small>
            </div>
            <p class="qris-scan-note">Ketuk gambar untuk membuka QRIS resolusi penuh. Selalu periksa nama merchant dan nominal sebelum menyelesaikan pembayaran.</p>
            <p class="qris-amounts">Contoh dukungan: <span data-suggested-amounts>Rp10.000 · Rp25.000 · Rp50.000</span></p>''',
)

styles = read('docs/styles.css')
style_marker = '.qris-image-frame img { display: block; width: 100%; height: auto; border-radius: 10px; }\n'
style_addition = style_marker + '''.qris-image-frame a { display: block; border-radius: 10px; overflow: hidden; }
.qris-image-frame a:hover img { filter: brightness(1.015); }
.qris-scan-note { max-width: 560px; margin: 14px auto 0; color: var(--dim); text-align: center; font-size: 11px; line-height: 1.6; }
.qris-merchant [data-merchant-nmid] { font-family: var(--mono); letter-spacing: .03em; }
'''
if styles.count(style_marker) != 1:
    raise RuntimeError('docs/styles.css: QRIS image marker changed')
write('docs/styles.css', styles.replace(style_marker, style_addition, 1))

sitemap = read('docs/sitemap.xml')
if SUPPORT_URL not in sitemap:
    block = '''  <url>
    <loc>https://masarray.github.io/arsonkupik-extension/id/dukung.html</loc>
    <lastmod>2026-07-18</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
'''
    sitemap = sitemap.replace('</urlset>', block + '</urlset>')
write('docs/sitemap.xml', sitemap)

write('QRIS_SETUP.md', '''# QRIS Support Setup

The Indonesia support page is currently activated with the official static merchant QRIS issued for **Sonkupik, Audio Developer**.

## Current verified merchant

- Scanner display name: `Sonkupik, Audio Developer`
- Printed merchant label: `SONKUPIK, AUDIO DEVELOPER, DIGITAL & KREATIF`
- City: `BOGOR`
- NMID: `ID1026551401775`
- Last repository verification: `2026-07-18`
- Official image SHA-256: `0095ddce62265f7a42795bb75a1077267a0873da75c84b745e23712cf53c4a11`

The committed file preserves the provider-issued JPEG bytes. It is not redrawn, regenerated, or modified inside the QR region.

## Replace or reverify the support QRIS

1. Obtain an official static merchant QRIS from an authorized provider.
2. Scan it with at least two banking or e-wallet applications.
3. Confirm the merchant name, city, NMID, and destination.
4. Use the guarded configuration command:

```bash
python3 scripts/configure_qris.py \
  --image "/path/to/official-qris.jpg" \
  --merchant-name "THE EXACT NAME SHOWN BY QRIS APPS" \
  --merchant-print-name "OPTIONAL FULL PRINTED LABEL" \
  --merchant-city "OPTIONAL CITY" \
  --merchant-nmid "OPTIONAL NMID"
```

The script accepts provider-issued PNG or JPEG files, validates their dimensions and aspect ratio, copies the original bytes into `docs/assets/`, enables the first-party support config, makes the page indexable, and adds the canonical URL to `sitemap.xml`.

5. Run `npm run release:check`.
6. Preview GitHub Pages and scan both the embedded image and the full-resolution image link.
7. Verify the merchant and amount before publishing.

To revoke the QRIS safely:

```bash
python3 scripts/configure_qris.py --disable
```

This removes QRIS assets, disables the support config, restores `noindex`, and removes the page from the sitemap.

## Security rules

- Never fabricate, redraw, or generate a payment QR from ordinary text.
- Never commit API keys, merchant secrets, bank credentials, transaction exports, phone numbers, or identity documents.
- Do not add tracking parameters, analytics, payment SDKs, automatic redirects, or payment-confirmation claims.
- Support must remain voluntary and must not unlock core extension functionality.
- Replace the image and update `lastVerified` immediately if the provider reissues or revokes the QRIS.
- The extension does not require a new release when only the GitHub Pages QRIS image or configuration changes.
''')

write('scripts/configure_qris.py', r'''#!/usr/bin/env python3
"""Safely enable, replace, or disable the first-party QRIS support page."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import struct
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "docs/support-config.js"
PAGE = ROOT / "docs/id/dukung.html"
SITEMAP = ROOT / "docs/sitemap.xml"
ASSET_DIR = ROOT / "docs/assets"
TARGETS = {
    ".png": ASSET_DIR / "qris-arsonkupik.png",
    ".jpg": ASSET_DIR / "qris-arsonkupik.jpg",
    ".jpeg": ASSET_DIR / "qris-arsonkupik.jpg",
}
URL = "https://masarray.github.io/arsonkupik-extension/id/dukung.html"


def png_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()[:24]
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError("QRIS image is not a valid PNG")
    return struct.unpack(">II", data[16:24])


def jpeg_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if len(data) < 4 or data[:2] != b"\xff\xd8":
        raise ValueError("QRIS image is not a valid JPEG")
    offset = 2
    sof = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
    while offset + 3 < len(data):
        if data[offset] != 0xFF:
            offset += 1
            continue
        while offset < len(data) and data[offset] == 0xFF:
            offset += 1
        marker = data[offset]
        offset += 1
        if marker in {0xD8, 0xD9} or 0xD0 <= marker <= 0xD7:
            continue
        length = int.from_bytes(data[offset:offset + 2], "big")
        if length < 2 or offset + length > len(data):
            break
        if marker in sof:
            return (
                int.from_bytes(data[offset + 5:offset + 7], "big"),
                int.from_bytes(data[offset + 3:offset + 5], "big"),
            )
        offset += length
    raise ValueError("Unable to read JPEG dimensions")


def image_dimensions(path: Path) -> tuple[int, int]:
    suffix = path.suffix.lower()
    if suffix == ".png":
        return png_dimensions(path)
    if suffix in {".jpg", ".jpeg"}:
        return jpeg_dimensions(path)
    raise ValueError("QRIS image must be PNG or JPEG")


def render_config(*, enabled: bool, image_name: str = "qris-arsonkupik.png", merchant: str = "ArSonKuPik", print_name: str = "", city: str = "", nmid: str = "", verified: str = "") -> str:
    return (
        "globalThis.ARSONKUPIK_SUPPORT_CONFIG = Object.freeze({\n"
        f"  qrisEnabled: {str(enabled).lower()},\n"
        f"  qrisImage: '../assets/{image_name}',\n"
        f"  merchantName: {json.dumps(merchant, ensure_ascii=False)},\n"
        f"  merchantPrintName: {json.dumps(print_name, ensure_ascii=False)},\n"
        f"  merchantCity: {json.dumps(city, ensure_ascii=False)},\n"
        f"  merchantNmid: {json.dumps(nmid, ensure_ascii=False)},\n"
        f"  lastVerified: {json.dumps(verified)},\n"
        "  suggestedAmounts: [10000, 25000, 50000]\n"
        "});\n"
    )


def set_robots(indexed: bool) -> None:
    text = PAGE.read_text(encoding="utf-8")
    if indexed:
        text = text.replace('<meta name="robots" content="noindex,follow">', '<meta name="robots" content="index,follow,max-image-preview:large">')
    else:
        text = text.replace('<meta name="robots" content="index,follow,max-image-preview:large">', '<meta name="robots" content="noindex,follow">')
    PAGE.write_text(text, encoding="utf-8")


def set_sitemap(enabled: bool, verified: str = "") -> None:
    text = SITEMAP.read_text(encoding="utf-8")
    marker = f"    <loc>{URL}</loc>"
    if enabled and marker not in text:
        block = (
            "  <url>\n"
            f"    <loc>{URL}</loc>\n"
            f"    <lastmod>{verified}</lastmod>\n"
            "    <changefreq>monthly</changefreq>\n"
            "    <priority>0.6</priority>\n"
            "  </url>\n"
        )
        text = text.replace("</urlset>", block + "</urlset>")
    elif not enabled and marker in text:
        start = text.rfind("  <url>\n", 0, text.index(marker))
        end = text.index("  </url>\n", text.index(marker)) + len("  </url>\n")
        text = text[:start] + text[end:]
    SITEMAP.write_text(text, encoding="utf-8")


def enable(args: argparse.Namespace) -> None:
    source = Path(args.image).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"QRIS image not found: {source}")
    suffix = source.suffix.lower()
    if suffix not in TARGETS:
        raise ValueError("QRIS image must use .png, .jpg, or .jpeg")
    width, height = image_dimensions(source)
    ratio = max(width, height) / min(width, height)
    if min(width, height) < 600 or ratio > 2.25:
        raise ValueError(f"QRIS image must be at least 600 px on its shortest side with a reasonable aspect ratio; received {width}×{height}")
    merchant = args.merchant_name.strip()
    if not merchant:
        raise ValueError("Merchant name must match the name shown by QRIS apps")
    nmid = args.merchant_nmid.strip().upper()
    if nmid and not re.fullmatch(r"ID\d{13}", nmid):
        raise ValueError("NMID must use the form ID followed by 13 digits")
    verified = args.verified_date or date.today().isoformat()
    date.fromisoformat(verified)
    target = TARGETS[suffix]
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    for candidate in set(TARGETS.values()):
        if candidate != target and candidate.exists():
            candidate.unlink()
    shutil.copy2(source, target)
    CONFIG.write_text(render_config(enabled=True, image_name=target.name, merchant=merchant, print_name=args.merchant_print_name.strip(), city=args.merchant_city.strip(), nmid=nmid, verified=verified), encoding="utf-8")
    set_robots(True)
    set_sitemap(True, verified)
    print(f"QRIS enabled: {target.relative_to(ROOT)} ({width}×{height})")
    print(f"Merchant: {merchant}")
    if nmid:
        print(f"NMID: {nmid}")
    print("Run: npm run release:check")


def disable() -> None:
    CONFIG.write_text(render_config(enabled=False), encoding="utf-8")
    set_robots(False)
    set_sitemap(False)
    for target in set(TARGETS.values()):
        if target.exists():
            target.unlink()
    print("QRIS support disabled; images removed, page set to noindex, sitemap entry removed.")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", help="Path to an official static merchant QRIS PNG or JPEG")
    parser.add_argument("--merchant-name", default="", help="Exact merchant name shown by QRIS apps")
    parser.add_argument("--merchant-print-name", default="", help="Optional full merchant label printed on the QRIS sheet")
    parser.add_argument("--merchant-city", default="", help="Optional merchant city")
    parser.add_argument("--merchant-nmid", default="", help="Optional NMID in ID1234567890123 form")
    parser.add_argument("--verified-date", default="", help="Verification date in YYYY-MM-DD")
    parser.add_argument("--disable", action="store_true")
    args = parser.parse_args()
    if args.disable:
        disable()
        return 0
    if not args.image or not args.merchant_name:
        parser.error("--image and --merchant-name are required unless --disable is used")
    enable(args)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"QRIS configuration failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
''')

old_validate = '''    support_config_text = (ROOT / "docs/support-config.js").read_text(encoding="utf-8")
    qris_enabled = bool(re.search(r"qrisEnabled\\s*:\\s*true", support_config_text))
    qris_image = ROOT / "docs/assets/qris-arsonkupik.png"
    support_page_text = (ROOT / "docs/id/dukung.html").read_text(encoding="utf-8")
    sitemap_text = (ROOT / "docs/sitemap.xml").read_text(encoding="utf-8")
    support_url = PROJECT_SUPPORT_URL
    qris_verified = re.search(r"lastVerified\\s*:\\s*['\\\"]([^'\\\"]*)", support_config_text)
    qris_verified_value = qris_verified.group(1).strip() if qris_verified else ""
    if qris_enabled:
        if not qris_image.is_file():
            fail("QRIS is enabled but docs/assets/qris-arsonkupik.png is missing", failures)
        else:
            raw = qris_image.read_bytes()[:24]
            if len(raw) < 24 or raw[:8] != b"\\x89PNG\\r\\n\\x1a\\n" or raw[12:16] != b"IHDR":
                fail("Enabled QRIS asset is not a valid PNG", failures)
            else:
                width = int.from_bytes(raw[16:20], "big")
                height = int.from_bytes(raw[20:24], "big")
                if width != height or min(width, height) < 600:
                    fail(f"Enabled QRIS PNG must be square and at least 600×600; received {width}×{height}", failures)
        if 'name="robots" content="index,follow' not in support_page_text:
            fail("Enabled QRIS support page must be indexable", failures)
        if support_url not in sitemap_text:
            fail("Enabled QRIS support page is missing from sitemap.xml", failures)
        if not qris_verified_value:
            fail("Enabled QRIS config must include lastVerified", failures)
'''
new_validate = '''    support_config_text = (ROOT / "docs/support-config.js").read_text(encoding="utf-8")
    qris_enabled = bool(re.search(r"qrisEnabled\\s*:\\s*true", support_config_text))
    qris_match = re.search(r"qrisImage\\s*:\\s*['\\\"]\\.\\./assets/([^'\\\"]+)", support_config_text)
    qris_image = ROOT / "docs/assets" / qris_match.group(1) if qris_match else ROOT / "docs/assets/qris-arsonkupik.invalid"
    support_page_text = (ROOT / "docs/id/dukung.html").read_text(encoding="utf-8")
    sitemap_text = (ROOT / "docs/sitemap.xml").read_text(encoding="utf-8")
    support_url = PROJECT_SUPPORT_URL
    qris_verified = re.search(r"lastVerified\\s*:\\s*['\\\"]([^'\\\"]*)", support_config_text)
    qris_verified_value = qris_verified.group(1).strip() if qris_verified else ""
    qris_nmid = re.search(r"merchantNmid\\s*:\\s*['\\\"]([^'\\\"]*)", support_config_text)
    qris_nmid_value = qris_nmid.group(1).strip() if qris_nmid else ""
    if qris_enabled:
        if not qris_image.is_file():
            fail(f"QRIS is enabled but {qris_image.relative_to(ROOT)} is missing", failures)
        else:
            raw = qris_image.read_bytes()
            is_png = len(raw) >= 24 and raw[:8] == b"\\x89PNG\\r\\n\\x1a\\n" and raw[12:16] == b"IHDR"
            is_jpeg = len(raw) >= 4 and raw[:2] == b"\\xff\\xd8" and raw[-2:] == b"\\xff\\xd9"
            if not (is_png or is_jpeg):
                fail("Enabled QRIS asset must be a valid PNG or JPEG", failures)
            if len(raw) < 10_000:
                fail("Enabled QRIS asset is unexpectedly small", failures)
        if 'name="robots" content="index,follow' not in support_page_text:
            fail("Enabled QRIS support page must be indexable", failures)
        if support_url not in sitemap_text:
            fail("Enabled QRIS support page is missing from sitemap.xml", failures)
        if not qris_verified_value:
            fail("Enabled QRIS config must include lastVerified", failures)
        if qris_nmid_value and not re.fullmatch(r"ID\\d{13}", qris_nmid_value):
            fail("Enabled QRIS config has an invalid NMID", failures)
'''
replace_once('scripts/validate.py', old_validate, new_validate)

write('scripts/smoke_support.mjs', '''import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const worker = read('src/background/service-worker.js');
const messaging = read('src/shared/messaging.js');
const popup = read('popup.html') + read('src/popup/popup.js');
const studio = read('studio.html') + read('src/studio/studio.js');
const supportPage = read('docs/id/dukung.html');
const supportScript = read('docs/support-page.js');
const privacy = read('PRIVACY.md');
const sitemap = read('docs/sitemap.xml');

assert.match(worker, /OPEN_SUPPORT_PAGE/);
assert.match(worker, /https:\/\/masarray\.github\.io\/arsonkupik-extension\/id\/dukung\.html/);
assert.match(messaging, /export async function openSupportPage/);
assert.match(popup, /supportDevelopmentButton/);
assert.match(studio, /btnSupportDevelopment/);
assert.match(supportPage, /Dukungan sepenuhnya sukarela/);
assert.match(supportPage, /Semua fitur utama tetap tersedia/);
assert.match(supportPage, /index,follow,max-image-preview:large/);
assert.match(supportPage, /data-merchant-nmid/);
assert.match(supportPage, /data-qris-link/);
assert.match(sitemap, /\/id\/dukung\.html/);
assert.match(privacy, /does not receive transaction status|does not determine whether a user contributes/);
assert.doesNotMatch(supportScript, /\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|sendBeacon/);

const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(read('docs/support-config.js'), context);
const config = context.globalThis.ARSONKUPIK_SUPPORT_CONFIG;
assert.equal(config.qrisEnabled, true);
assert.equal(config.qrisImage, '../assets/qris-arsonkupik.jpg');
assert.equal(config.merchantName, 'Sonkupik, Audio Developer');
assert.equal(config.merchantCity, 'BOGOR');
assert.equal(config.merchantNmid, 'ID1026551401775');
assert.equal(config.lastVerified, '2026-07-18');
assert.ok(Array.isArray(config.suggestedAmounts));

const assetPath = path.join(root, 'docs/assets/qris-arsonkupik.jpg');
const asset = fs.readFileSync(assetPath);
assert.equal(asset.subarray(0, 2).toString('hex'), 'ffd8');
assert.equal(asset.subarray(-2).toString('hex'), 'ffd9');
assert.equal(
  crypto.createHash('sha256').update(asset).digest('hex'),
  '0095ddce62265f7a42795bb75a1077267a0873da75c84b745e23712cf53c4a11'
);

console.log('Official QRIS support flow, metadata, asset integrity, and no-tracking checks passed.');
''')

replace_once(
    'README.md',
    'ArSonKuPik remains free to use. The optional [Indonesia support page](https://masarray.github.io/arsonkupik-extension/id/dukung.html) is prepared for an official merchant QRIS and clearly remains inactive until that QRIS is verified. The link is user-initiated, contains no analytics or payment SDK, and never unlocks or restricts core features. Activation instructions are documented in [QRIS_SETUP.md](QRIS_SETUP.md).',
    'ArSonKuPik remains free to use. The optional [Indonesia support page](https://masarray.github.io/arsonkupik-extension/id/dukung.html) now displays the verified official static merchant QRIS for Sonkupik, Audio Developer. The link is user-initiated, contains no analytics or payment SDK, and never unlocks or restricts core features. Verification and replacement procedures are documented in [QRIS_SETUP.md](QRIS_SETUP.md).',
)
replace_once(
    'SUPPORT_DEVELOPMENT.md',
    'See [QRIS_SETUP.md](QRIS_SETUP.md) before enabling the payment image.',
    'See [QRIS_SETUP.md](QRIS_SETUP.md) for the verified merchant record and safe replacement or revocation procedure.',
)

print(f'Official QRIS activated: {ASSET.relative_to(ROOT)} ({width}x{height})')
print(f'SHA-256: {digest}')
