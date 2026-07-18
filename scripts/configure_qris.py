#!/usr/bin/env python3
"""Safely enable or disable the first-party QRIS support page."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import struct
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "docs/support-config.js"
PAGE = ROOT / "docs/id/dukung.html"
SITEMAP = ROOT / "docs/sitemap.xml"
URL = "https://masarray.github.io/arsonkupik-extension/id/dukung.html"


def png_dimensions(data: bytes) -> tuple[int, int]:
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError("QRIS web image must be a valid PNG file")
    return struct.unpack(">II", data[16:24])


def render_config(
    *,
    enabled: bool,
    image_uri: str = "",
    image_hash: str = "",
    merchant: str = "ArSonKuPik",
    city: str = "",
    nmid: str = "",
    verified: str = "",
) -> str:
    source = (
        "provider-issued QRIS image, cropped with quiet zone preserved and scan-verified for web display"
        if enabled
        else ""
    )
    return (
        "globalThis.ARSONKUPIK_SUPPORT_CONFIG = Object.freeze({\n"
        f"  qrisEnabled: {str(enabled).lower()},\n"
        f"  qrisImage: {json.dumps(image_uri)},\n"
        f"  qrisImageSha256: {json.dumps(image_hash)},\n"
        f"  qrisSource: {json.dumps(source)},\n"
        f"  merchantName: {json.dumps(merchant, ensure_ascii=False)},\n"
        f"  merchantCity: {json.dumps(city, ensure_ascii=False)},\n"
        f"  nmid: {json.dumps(nmid)},\n"
        f"  lastVerified: {json.dumps(verified)},\n"
        "  suggestedAmounts: [10000, 25000, 50000]\n"
        "});\n"
    )


def update_page(*, enabled: bool, merchant: str = "ArSonKuPik", nmid: str = "") -> None:
    text = PAGE.read_text(encoding="utf-8")
    if enabled:
        text = text.replace(
            '<meta name="robots" content="noindex,follow">',
            '<meta name="robots" content="index,follow,max-image-preview:large">',
        )
        text = re.sub(
            r'<strong data-merchant-name>.*?</strong>',
            f'<strong data-merchant-name>{merchant.replace("&", "&amp;")}</strong>',
            text,
            count=1,
        )
        nmid_line = f'<small class="qris-nmid">NMID: {nmid}</small>'
        if 'class="qris-nmid"' in text:
            text = re.sub(r'<small class="qris-nmid">.*?</small>', nmid_line, text, count=1)
        else:
            text = text.replace('</strong>\n              <small data-merchant-city', f'</strong>\n              {nmid_line}\n              <small data-merchant-city', 1)
    else:
        text = text.replace(
            '<meta name="robots" content="index,follow,max-image-preview:large">',
            '<meta name="robots" content="noindex,follow">',
        )
        text = re.sub(r'\n\s*<small class="qris-nmid">.*?</small>', "", text, count=1)
        text = re.sub(r'<strong data-merchant-name>.*?</strong>', '<strong data-merchant-name>ArSonKuPik</strong>', text, count=1)
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
        raise FileNotFoundError(f"QRIS PNG not found: {source}")

    data = source.read_bytes()
    width, height = png_dimensions(data)
    if width != height or min(width, height) < 600:
        raise ValueError(f"QRIS web PNG must be square and at least 600×600; received {width}×{height}")

    merchant = args.merchant_name.strip()
    city = args.merchant_city.strip()
    nmid = args.nmid.strip()
    if not merchant or not nmid:
        raise ValueError("Merchant name and NMID must match the values shown by QRIS apps")
    if not re.fullmatch(r"ID\d{13}", nmid):
        raise ValueError(f"Unexpected NMID format: {nmid}")

    verified = args.verified_date or date.today().isoformat()
    date.fromisoformat(verified)
    digest = hashlib.sha256(data).hexdigest()
    image_uri = "data:image/png;base64," + base64.b64encode(data).decode("ascii")

    CONFIG.write_text(
        render_config(
            enabled=True,
            image_uri=image_uri,
            image_hash=digest,
            merchant=merchant,
            city=city,
            nmid=nmid,
            verified=verified,
        ),
        encoding="utf-8",
    )
    update_page(enabled=True, merchant=merchant, nmid=nmid)
    set_sitemap(True, verified)

    print(f"QRIS enabled from {source.name} ({width}×{height})")
    print(f"Merchant: {merchant}")
    print(f"NMID: {nmid}")
    print(f"SHA-256: {digest}")
    print("Run: npm run check && npm run release:check && npm run package")


def disable() -> None:
    CONFIG.write_text(render_config(enabled=False), encoding="utf-8")
    update_page(enabled=False)
    set_sitemap(False)
    print("QRIS support disabled; page set to noindex and sitemap entry removed.")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", help="Path to a verified square QRIS web PNG")
    parser.add_argument("--merchant-name", default="", help="Exact merchant name shown by QRIS apps")
    parser.add_argument("--merchant-city", default="", help="Merchant city shown by QRIS apps")
    parser.add_argument("--nmid", default="", help="Exact merchant NMID")
    parser.add_argument("--verified-date", default="", help="Verification date in YYYY-MM-DD")
    parser.add_argument("--disable", action="store_true")
    args = parser.parse_args()
    if args.disable:
        disable()
        return 0
    if not args.image or not args.merchant_name or not args.nmid:
        parser.error("--image, --merchant-name, and --nmid are required unless --disable is used")
    enable(args)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"QRIS configuration failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
