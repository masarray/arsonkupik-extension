#!/usr/bin/env python3
"""Safely enable or disable the first-party QRIS support page."""

from __future__ import annotations

import argparse
import json
import shutil
import struct
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "docs/support-config.js"
PAGE = ROOT / "docs/id/dukung.html"
SITEMAP = ROOT / "docs/sitemap.xml"
TARGET = ROOT / "docs/assets/qris-arsonkupik.png"
URL = "https://masarray.github.io/arsonkupik-extension/id/dukung.html"


def png_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()[:24]
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError("QRIS image must be a valid PNG file")
    return struct.unpack(">II", data[16:24])


def render_config(*, enabled: bool, merchant: str = "ArSonKuPik", city: str = "", verified: str = "") -> str:
    return (
        "globalThis.ARSONKUPIK_SUPPORT_CONFIG = Object.freeze({\n"
        f"  qrisEnabled: {str(enabled).lower()},\n"
        "  qrisImage: '../assets/qris-arsonkupik.png',\n"
        f"  merchantName: {json.dumps(merchant, ensure_ascii=False)},\n"
        f"  merchantCity: {json.dumps(city, ensure_ascii=False)},\n"
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
        raise FileNotFoundError(f"QRIS PNG not found: {source}")
    width, height = png_dimensions(source)
    if min(width, height) < 600:
        raise ValueError(f"QRIS PNG shortest side must be at least 600 pixels; received {width}×{height}")
    ratio = max(width, height) / min(width, height)
    if ratio > 2.0:
        raise ValueError(f"QRIS artwork aspect ratio is unexpectedly extreme: {width}×{height}")
    merchant = args.merchant_name.strip()
    if not merchant:
        raise ValueError("Merchant name must match the name shown by the QRIS scanner")
    verified = args.verified_date or date.today().isoformat()
    date.fromisoformat(verified)
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, TARGET)
    CONFIG.write_text(render_config(enabled=True, merchant=merchant, city=args.merchant_city.strip(), verified=verified), encoding="utf-8")
    set_robots(True)
    set_sitemap(True, verified)
    print(f"QRIS enabled: {TARGET.relative_to(ROOT)} ({width}×{height})")
    print(f"Merchant: {merchant}")
    print("Run: npm run release:check")


def disable() -> None:
    CONFIG.write_text(render_config(enabled=False), encoding="utf-8")
    set_robots(False)
    set_sitemap(False)
    if TARGET.exists():
        TARGET.unlink()
    print("QRIS support disabled; image removed, page set to noindex, sitemap entry removed.")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", help="Path to the complete official static merchant QRIS PNG")
    parser.add_argument("--merchant-name", default="", help="Exact merchant name shown by QRIS apps")
    parser.add_argument("--merchant-city", default="", help="Optional merchant city")
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
