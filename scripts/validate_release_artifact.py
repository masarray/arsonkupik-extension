#!/usr/bin/env python3
"""Validate the exact Chrome Web Store ZIP produced by package_extension.py."""
from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
manifest_source = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
version = manifest_source["version"]
archive_path = ROOT / "dist" / f"ArSonKuPik-v{version}-chrome-web-store.zip"
required = {
    "manifest.json",
    "popup.html",
    "studio.html",
    "offscreen.html",
    "_locales/en/messages.json",
    "_locales/id/messages.json",
    "src/background/service-worker.js",
    "src/offscreen/offscreen.js",
    "src/popup/popup.js",
    "src/shared/localization.js",
    "src/studio/studio.js",
}
forbidden_prefixes = ("scripts/", "docs/", ".github/", "dist/")
forbidden_suffixes = (".pem", ".crx", ".bak", ".tmp", ".map", ".log")


def fail(message: str) -> None:
    raise RuntimeError(message)


if not archive_path.is_file():
    fail(f"Release archive is missing: {archive_path.relative_to(ROOT)}")

with zipfile.ZipFile(archive_path) as archive:
    corrupt = archive.testzip()
    if corrupt:
        fail(f"Corrupt ZIP member: {corrupt}")
    names = archive.namelist()
    if len(names) != len(set(names)):
        fail("Release archive contains duplicate paths")
    members = set(names)
    missing = sorted(required - members)
    if missing:
        fail(f"Release archive is missing required file: {missing[0]}")
    if names and all(name.startswith("ArSonKuPik") for name in names):
        fail("manifest.json must be at the ZIP root, not inside a wrapper folder")
    for name in names:
        pure = PurePosixPath(name)
        if name.startswith("/") or ".." in pure.parts:
            fail(f"Unsafe archive path: {name}")
        if name.startswith(forbidden_prefixes) or name.endswith(forbidden_suffixes):
            fail(f"Development-only file was packaged: {name}")
    if "package.json" in members or "src/popup/qris-support.svg" in members:
        fail("Repository metadata or embedded QRIS prompt asset was packaged")

    manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
    if manifest != manifest_source:
        fail("Packaged manifest differs from repository manifest")
    if manifest.get("default_locale") != "en":
        fail("default_locale must be en")
    if manifest.get("host_permissions") not in ([], None):
        fail("Release must not declare host permissions")
    if "geolocation" in manifest.get("permissions", []):
        fail("Release must not request geolocation")

    catalogs = {
        locale: json.loads(archive.read(f"_locales/{locale}/messages.json").decode("utf-8"))
        for locale in ("en", "id")
    }
    if set(catalogs["en"]) != set(catalogs["id"]):
        fail("English and Indonesian locale keys differ")
    for locale, catalog in catalogs.items():
        description = str(catalog.get("extension_description", {}).get("message", ""))
        if not description or len(description) > 132:
            fail(f"{locale} extension description must contain 1-132 characters; received {len(description)}")
    for manifest_key in ("name", "short_name", "description"):
        value = str(manifest.get(manifest_key, ""))
        if value.startswith("__MSG_") and value.endswith("__"):
            message_key = value[6:-2]
            if message_key not in catalogs["en"]:
                fail(f"Default locale is missing manifest message: {message_key}")

    popup_js = archive.read("src/popup/popup.js").decode("utf-8")
    popup_html = archive.read("popup.html").decode("utf-8")
    forbidden_support = (
        "SUPPORT_PROMPT_DELAY_MS",
        "SUPPORT_REMINDER_DELAY_MS",
        "arsonkupikSupportPrompt",
        "maybeShowSupportPrompt",
        "openStudioWithSupportPrompt",
        'id="supportModal"',
    )
    combined = popup_js + "\n" + popup_html
    for token in forbidden_support:
        if token in combined:
            fail(f"Automatic or gated support token remains in release: {token}")

print(f"Validated Web Store artifact: {archive_path.name}")
print(f"Files: {len(names)}")
print(f"Size: {archive_path.stat().st_size / 1024:.1f} KiB")
