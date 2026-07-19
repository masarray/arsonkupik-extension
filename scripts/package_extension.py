#!/usr/bin/env python3
"""Create a deterministic Chrome Web Store ZIP from runtime files only."""

from __future__ import annotations

import hashlib
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
MANIFEST = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
VERSION = MANIFEST["version"]
OUTPUT = DIST / f"ArSonKuPik-v{VERSION}-chrome-web-store.zip"

INCLUDE_ROOT_FILES = ["manifest.json", "popup.html", "studio.html", "offscreen.html"]
INCLUDE_DIRS = ["src", "_locales"]
INCLUDE_ICON_FILES = [
    "icons/favicon.ico",
    "icons/icon-16.png",
    "icons/icon-32.png",
    "icons/icon-48.png",
    "icons/icon-128.png",
    "icons/icon-256.png",
    "icons/icon-512.png",
]
EXCLUDED_SUFFIXES = {".map", ".log", ".psd", ".ai"}
EXCLUDED_NAMES = {"README_REQUIRED_FONTS.txt", ".DS_Store", "Thumbs.db"}


def should_include(path: Path) -> bool:
    if path.name in EXCLUDED_NAMES or path.suffix.lower() in EXCLUDED_SUFFIXES:
        return False
    if path.name.startswith("."):
        return False
    return path.is_file()


def collect_files() -> list[Path]:
    files = [ROOT / name for name in INCLUDE_ROOT_FILES]
    files.extend(ROOT / name for name in INCLUDE_ICON_FILES)
    for directory in INCLUDE_DIRS:
        files.extend(path for path in (ROOT / directory).rglob("*") if should_include(path))
    missing = [path for path in files if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"Missing package file: {missing[0]}")
    return sorted(set(files), key=lambda path: path.relative_to(ROOT).as_posix())


def main() -> int:
    DIST.mkdir(exist_ok=True)
    for old in DIST.glob("ArSonKuPik-v*-chrome-web-store.zip"):
        old.unlink()

    files = collect_files()
    timestamp = (2026, 1, 1, 0, 0, 0)
    with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            relative = path.relative_to(ROOT).as_posix()
            info = zipfile.ZipInfo(relative, date_time=timestamp)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

    digest = hashlib.sha256(OUTPUT.read_bytes()).hexdigest()
    checksum_file = DIST / "SHA256SUMS.txt"
    checksum_file.write_text(f"{digest}  {OUTPUT.name}\n", encoding="utf-8")
    print(f"Created {OUTPUT.relative_to(ROOT)}")
    print(f"SHA-256: {digest}")
    print(f"Files: {len(files)}")
    print(f"Size: {OUTPUT.stat().st_size / 1024:.1f} KiB")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"Packaging failed: {exc}", file=sys.stderr)
        sys.exit(1)
