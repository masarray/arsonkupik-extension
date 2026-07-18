#!/usr/bin/env python3
"""Validate the ArSonKuPik repository without third-party dependencies."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "manifest.json"
RUNTIME_DIRS = [ROOT / "src"]
RUNTIME_HTML = [ROOT / "popup.html", ROOT / "studio.html", ROOT / "offscreen.html"]
PROJECT_REPOSITORY_URL = "https://github.com/masarray/arsonkupik-extension"
PROJECT_PAGES_URL = "https://masarray.github.io/arsonkupik-extension/"
PROJECT_PRIVACY_URL = f"{PROJECT_PAGES_URL}privacy.html"
PROJECT_SUPPORT_URL = f"{PROJECT_PAGES_URL}id/dukung.html"
LEGACY_PROJECT_URLS = (
    "https://github.com/masarray/" + "ArSonKuPik",
    "https://masarray.github.io/" + "ArSonKuPik/",
)

REQUIRED_FILES = [
    MANIFEST_PATH,
    ROOT / "popup.html",
    ROOT / "studio.html",
    ROOT / "offscreen.html",
    ROOT / "src/background/service-worker.js",
    ROOT / "src/offscreen/offscreen.js",
    ROOT / "src/popup/popup.js",
    ROOT / "src/shared/presets.js",
    ROOT / "src/shared/audio-stability.js",
    ROOT / "scripts/smoke_stability.mjs",
    ROOT / "icons/icon-128.png",
    ROOT / "README.md",
    ROOT / "PRIVACY.md",
    ROOT / "CHROME_WEB_STORE_PRIVACY_DISCLOSURE.md",
    ROOT / "CONTRIBUTOR_LICENSE_AGREEMENT.md",
    ROOT / "ASSET_ATTRIBUTION.md",
    ROOT / "THIRD_PARTY_NOTICES.md",
    ROOT / "TRADEMARKS.md",
    ROOT / "SUPPORT_DEVELOPMENT.md",
    ROOT / "QRIS_SETUP.md",
    ROOT / "docs/id/dukung.html",
    ROOT / "docs/support-config.js",
    ROOT / "docs/support-page.js",
    ROOT / "scripts/configure_qris.py",
    ROOT / "LICENSE",
]

REMOTE_CODE_PATTERNS = [
    re.compile(r"<script[^>]+src=[\"']https?://", re.I),
    re.compile(r"\bimport\s*\(\s*[\"']https?://", re.I),
    re.compile(r"\beval\s*\("),
    re.compile(r"\bnew\s+Function\s*\("),
]

ASSET_ATTR_PATTERN = re.compile(
    r"(?:src|href)=[\"']([^\"'#?]+)[\"']|url\(\s*[\"']?([^\"')?#]+)", re.I
)


def fail(message: str, failures: list[str]) -> None:
    failures.append(message)
    print(f"ERROR: {message}")


def note(message: str) -> None:
    print(f"OK: {message}")


def iter_runtime_text_files() -> list[Path]:
    files: list[Path] = []
    for directory in RUNTIME_DIRS:
        files.extend(
            path
            for path in directory.rglob("*")
            if path.is_file() and path.suffix.lower() in {".js", ".css", ".html", ".json"}
        )
    files.extend(path for path in RUNTIME_HTML if path.exists())
    return sorted(set(files))


def validate_json(path: Path, failures: list[str]) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        fail(f"Invalid JSON in {path.relative_to(ROOT)}: {exc}", failures)
        return {}


def validate_local_references(path: Path, failures: list[str]) -> None:
    text = path.read_text(encoding="utf-8")
    for match in ASSET_ATTR_PATTERN.finditer(text):
        value = next((group for group in match.groups() if group), "")
        if not value or value.startswith(("data:", "mailto:", "tel:", "javascript:")):
            continue
        if value.startswith(("http://", "https://", "//")):
            continue
        target = (path.parent / value).resolve()
        try:
            target.relative_to(ROOT)
        except ValueError:
            fail(f"Reference escapes repository root: {path.relative_to(ROOT)} -> {value}", failures)
            continue
        if not target.exists():
            if "src/assets/fonts/" in target.as_posix() and target.suffix in {".woff", ".woff2"}:
                print(f"WARN: Optional local font not bundled: {target.relative_to(ROOT)}")
                continue
            fail(f"Missing local asset: {path.relative_to(ROOT)} -> {value}", failures)


class SiteHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.references: list[str] = []
        self.json_ld: list[str] = []
        self._json_ld_buffer: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value or "" for key, value in attrs}
        for name in ("href", "src"):
            if values.get(name):
                self.references.append(values[name])
        if tag.lower() == "script" and values.get("type", "").lower() == "application/ld+json":
            self._json_ld_buffer = []

    def handle_data(self, data: str) -> None:
        if self._json_ld_buffer is not None:
            self._json_ld_buffer.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "script" and self._json_ld_buffer is not None:
            self.json_ld.append("".join(self._json_ld_buffer))
            self._json_ld_buffer = None


def validate_site(failures: list[str]) -> None:
    docs = ROOT / "docs"
    required_pages = [docs / "index.html", docs / "id/index.html", docs / "privacy.html", docs / "support.html", docs / "id/dukung.html"]
    for path in sorted(docs.rglob("*.html")):
        text = path.read_text(encoding="utf-8")
        parser = SiteHTMLParser()
        try:
            parser.feed(text)
        except Exception as exc:  # noqa: BLE001
            fail(f"Invalid HTML structure in {path.relative_to(ROOT)}: {exc}", failures)
            continue
        for ref in parser.references:
            clean = ref.split("#", 1)[0].split("?", 1)[0]
            if not clean or clean.startswith(("#", "http://", "https://", "//", "/", "mailto:", "tel:", "data:", "javascript:")):
                continue
            target = (path.parent / clean).resolve()
            try:
                target.relative_to(docs.resolve())
            except ValueError:
                fail(f"Website reference escapes docs/: {path.relative_to(ROOT)} -> {ref}", failures)
                continue
            if not target.exists():
                fail(f"Broken website reference: {path.relative_to(ROOT)} -> {ref}", failures)
        for block in parser.json_ld:
            try:
                json.loads(block)
            except Exception as exc:  # noqa: BLE001
                fail(f"Invalid JSON-LD in {path.relative_to(ROOT)}: {exc}", failures)

    for path in required_pages:
        text = path.read_text(encoding="utf-8") if path.exists() else ""
        if not re.search(r"<title>.+?</title>", text, re.I | re.S):
            fail(f"Missing page title: {path.relative_to(ROOT)}", failures)
        if not re.search(r"<meta\s+name=[\"']description[\"']", text, re.I):
            fail(f"Missing meta description: {path.relative_to(ROOT)}", failures)
        if not re.search(r"<link\s+rel=[\"']canonical[\"']", text, re.I):
            fail(f"Missing canonical URL: {path.relative_to(ROOT)}", failures)

    validate_json(docs / "site.webmanifest", failures)
    try:
        ET.parse(docs / "sitemap.xml")
    except Exception as exc:  # noqa: BLE001
        fail(f"Invalid sitemap.xml: {exc}", failures)
    note("GitHub Pages HTML, local links, JSON-LD, manifest, and sitemap validated")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--release", action="store_true", help="Enable stricter release checks")
    args = parser.parse_args()
    failures: list[str] = []

    for path in REQUIRED_FILES:
        if not path.exists():
            fail(f"Required file is missing: {path.relative_to(ROOT)}", failures)
    if failures:
        return 1
    note("Required repository and runtime files exist")

    manifest = validate_json(MANIFEST_PATH, failures)
    if manifest.get("manifest_version") != 3:
        fail("manifest_version must be 3", failures)
    if manifest.get("host_permissions") not in ([], None):
        fail("Runtime must not declare host_permissions without an approved privacy review", failures)
    if "contentSettings" in manifest.get("permissions", []):
        fail("contentSettings permission is forbidden by the P0 privacy hardening policy", failures)
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:\.\d+)?", str(manifest.get("version", ""))):
        fail("Manifest version is not Chrome-compatible numeric dot notation", failures)

    package = validate_json(ROOT / "package.json", failures)
    if package.get("version") != manifest.get("version"):
        fail("package.json and manifest.json versions differ", failures)
    else:
        note(f"Version alignment confirmed: {manifest.get('version')}")

    icon_map = manifest.get("icons", {})
    for _, value in icon_map.items():
        if not (ROOT / value).is_file():
            fail(f"Manifest icon is missing: {value}", failures)

    runtime_files = iter_runtime_text_files()
    for path in runtime_files:
        text = path.read_text(encoding="utf-8")
        for pattern in REMOTE_CODE_PATTERNS:
            if pattern.search(text):
                fail(f"Forbidden runtime code pattern in {path.relative_to(ROOT)}: {pattern.pattern}", failures)
        if path.suffix.lower() in {".html", ".css"}:
            validate_local_references(path, failures)
    note(f"Scanned {len(runtime_files)} runtime text files for remote code and broken assets")
    runtime_source = "\n".join(path.read_text(encoding="utf-8") for path in runtime_files)
    if "chrome.contentSettings" in runtime_source:
        fail("Runtime still references chrome.contentSettings", failures)
    if "audio-recomend-sc220" in runtime_source.lower() or "sc220 mkii" in runtime_source.lower():
        fail("Runtime still contains the removed product-specific recommendation asset", failures)
    if "ACCEPT_PRIVACY_NOTICE" not in runtime_source or "RESET_ALL_LOCAL_DATA" not in runtime_source:
        fail("Required privacy consent and deletion controls are missing from runtime", failures)
    note("P0 privacy gate, deletion controls, and permission minimization validated")
    forbidden_route_tokens = ("outputDeviceId", "outputRouteStatus", "setSinkId", "createMediaStreamDestination", "processedOutput", "domainOutputRoutes")
    for token in forbidden_route_tokens:
        if token in runtime_source:
            fail(f"Removed output-routing runtime token remains: {token}", failures)
    if (ROOT / "src/shared/audio-devices.js").exists():
        fail("Obsolete output-device helper must not be packaged", failures)
    if "SET_MONITORING_ACTIVE" not in runtime_source or "createMonitoringNodes" not in runtime_source or "destroyMonitoringNodes" not in runtime_source:
        fail("On-demand Studio monitoring guard is incomplete", failures)
    if "rebuildGraphSafely" not in runtime_source:
        fail("Click-safe graph rebuild guard is missing", failures)
    note("Headless playback path and removed output routing validated")

    support_config_text = (ROOT / "docs/support-config.js").read_text(encoding="utf-8")
    qris_enabled = bool(re.search(r"qrisEnabled\s*:\s*true", support_config_text))
    qris_image_match = re.search(r"qrisImage\s*:\s*['\"]([^'\"]*)", support_config_text)
    qris_image_value = qris_image_match.group(1) if qris_image_match else ""
    qris_hash_match = re.search(r"qrisImageSha256\s*:\s*['\"]([0-9a-f]{64})", support_config_text)
    qris_hash_value = qris_hash_match.group(1) if qris_hash_match else ""
    qris_nmid_match = re.search(r"nmid\s*:\s*['\"]([^'\"]*)", support_config_text)
    qris_nmid_value = qris_nmid_match.group(1).strip() if qris_nmid_match else ""
    support_page_text = (ROOT / "docs/id/dukung.html").read_text(encoding="utf-8")
    sitemap_text = (ROOT / "docs/sitemap.xml").read_text(encoding="utf-8")
    support_url = PROJECT_SUPPORT_URL
    qris_verified = re.search(r"lastVerified\s*:\s*['\"]([^'\"]*)", support_config_text)
    qris_verified_value = qris_verified.group(1).strip() if qris_verified else ""

    if qris_enabled:
        prefix = "data:image/png;base64,"
        if not qris_image_value.startswith(prefix):
            fail("Enabled QRIS must use a local embedded PNG data URI", failures)
        else:
            try:
                image_bytes = base64.b64decode(qris_image_value[len(prefix):], validate=True)
            except Exception as exc:  # noqa: BLE001
                fail(f"Enabled QRIS contains invalid base64 image data: {exc}", failures)
                image_bytes = b""
            if image_bytes:
                digest = hashlib.sha256(image_bytes).hexdigest()
                if not qris_hash_value or digest != qris_hash_value:
                    fail("Enabled QRIS image SHA-256 does not match qrisImageSha256", failures)
                raw = image_bytes[:24]
                if len(raw) < 24 or raw[:8] != b"\x89PNG\r\n\x1a\n" or raw[12:16] != b"IHDR":
                    fail("Enabled QRIS embedded image is not a valid PNG", failures)
                else:
                    width = int.from_bytes(raw[16:20], "big")
                    height = int.from_bytes(raw[20:24], "big")
                    if width != height or min(width, height) < 600:
                        fail(f"Enabled QRIS PNG must be square and at least 600×600; received {width}×{height}", failures)
        if not re.fullmatch(r"ID\d{13}", qris_nmid_value):
            fail("Enabled QRIS config must include a valid NMID", failures)
        if qris_nmid_value and f"NMID: {qris_nmid_value}" not in support_page_text:
            fail("Enabled QRIS page NMID does not match support configuration", failures)
        if (ROOT / "docs/assets/qris-arsonkupik.svg").exists():
            fail("Reconstructed QRIS SVG is forbidden; use the audited provider-derived PNG", failures)
        if 'name="robots" content="index,follow' not in support_page_text:
            fail("Enabled QRIS support page must be indexable", failures)
        if support_url not in sitemap_text:
            fail("Enabled QRIS support page is missing from sitemap.xml", failures)
        if not qris_verified_value:
            fail("Enabled QRIS config must include lastVerified", failures)
    else:
        if 'name="robots" content="noindex,follow"' not in support_page_text:
            fail("Disabled QRIS support page must remain noindex", failures)
        if support_url in sitemap_text:
            fail("Disabled QRIS support page must not be listed in sitemap.xml", failures)

    if "OPEN_SUPPORT_PAGE" not in runtime_source or "supportDevelopmentButton" not in runtime_source or "btnSupportDevelopment" not in runtime_source:
        fail("User-initiated support entry points are incomplete", failures)
    if "Dukungan sepenuhnya sukarela" not in support_page_text or "Semua fitur utama tetap tersedia" not in support_page_text:
        fail("Support page is missing voluntary/no-paywall disclosure", failures)
    support_script_text = (ROOT / "docs/support-page.js").read_text(encoding="utf-8")
    if re.search(r"\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage", support_script_text):
        fail("Support page must not add tracking, network APIs, or browser storage", failures)
    note(f"Indonesia QRIS support flow validated (enabled={qris_enabled})")

    text_extensions = {".md", ".html", ".js", ".mjs", ".json", ".xml", ".txt", ".yml", ".yaml", ".py"}
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in text_extensions or ".git" in path.parts or "dist" in path.parts:
            continue
        content = path.read_text(encoding="utf-8")
        for legacy_url in LEGACY_PROJECT_URLS:
            if legacy_url in content:
                fail(f"Legacy repository URL remains in {path.relative_to(ROOT)}: {legacy_url}", failures)
    if manifest.get("homepage_url") != PROJECT_PAGES_URL:
        fail("manifest homepage_url does not match the current GitHub Pages project", failures)
    worker_text = (ROOT / "src/background/service-worker.js").read_text(encoding="utf-8")
    if PROJECT_PRIVACY_URL not in worker_text or PROJECT_SUPPORT_URL not in worker_text:
        fail("Runtime privacy/support URLs do not match the current GitHub Pages project", failures)
    note("Repository relocation URLs validated")

    validate_site(failures)

    if manifest.get("background", {}).get("type") != "module":
        fail("Manifest V3 service worker must be declared as a module", failures)
    if "storage" not in manifest.get("permissions", []):
        fail("storage permission is required by the current state model", failures)
    if "tabCapture" not in manifest.get("permissions", []):
        fail("tabCapture permission is required by the current audio source model", failures)

    if args.release:
        changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
        version = manifest.get("version", "")
        if f"[{version}]" not in changelog:
            fail(f"CHANGELOG.md has no release entry for {version}", failures)
        if manifest.get("homepage_url") != PROJECT_PAGES_URL:
            fail("Unexpected manifest homepage_url for release", failures)
        privacy_text = (ROOT / "PRIVACY.md").read_text(encoding="utf-8")
        if "Limited Use requirements" not in privacy_text:
            fail("PRIVACY.md is missing the Chrome Web Store Limited Use statement", failures)
        pr_template = (ROOT / ".github/PULL_REQUEST_TEMPLATE.md").read_text(encoding="utf-8")
        if "Contributor License Agreement" not in pr_template:
            fail("Pull-request template does not record CLA acceptance", failures)
        if "[0.3.102]" not in changelog and version == "0.3.102":
            fail("CHANGELOG.md is missing the support release entry", failures)
        if "OPEN_SUPPORT_PAGE" not in runtime_source:
            fail("Release is missing the user-initiated support-page command", failures)
        note("Release metadata checks completed")

    if failures:
        print(f"\nValidation failed with {len(failures)} error(s).")
        return 1
    print("\nArSonKuPik repository validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
