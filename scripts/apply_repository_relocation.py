#!/usr/bin/env python3
"""One-shot migration for the dedicated arsonkupik-extension repository."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD_REPO = "https://github.com/masarray/ArSonKuPik"
NEW_REPO = "https://github.com/masarray/arsonkupik-extension"
OLD_PAGES = "https://masarray.github.io/ArSonKuPik/"
NEW_PAGES = "https://masarray.github.io/arsonkupik-extension/"
TEXT_SUFFIXES = {".md", ".html", ".js", ".mjs", ".json", ".xml", ".txt", ".yml", ".yaml", ".py"}


def replace_project_urls() -> None:
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        if ".git" in path.parts or "dist" in path.parts or path.name == Path(__file__).name:
            continue
        text = path.read_text(encoding="utf-8")
        updated = text.replace(OLD_REPO, NEW_REPO).replace(OLD_PAGES, NEW_PAGES)
        updated = updated.replace(
            "git clone https://github.com/masarray/arsonkupik-extension.git\ncd ArSonKuPik",
            "git clone https://github.com/masarray/arsonkupik-extension.git\ncd arsonkupik-extension",
        )
        if updated != text:
            path.write_text(updated, encoding="utf-8")


def replace_in(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"Expected text not found in {path}: {old}")
    target.write_text(text.replace(old, new), encoding="utf-8")


def write_workflows() -> None:
    (ROOT / ".github/workflows/validate.yml").write_text(
        """name: Validate repository

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.13"

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Run complete repository checks
        run: npm run check

      - name: Build extension package
        run: npm run package

      - name: Verify archive integrity and contents
        shell: bash
        run: |
          ZIP=$(find dist -maxdepth 1 -name 'ArSonKuPik-v*-chrome-web-store.zip' -print -quit)
          test -n "$ZIP"
          unzip -t "$ZIP"
          unzip -l "$ZIP"
""",
        encoding="utf-8",
    )
    (ROOT / ".github/workflows/release.yml").write_text(
        """name: Package release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.13"

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Run complete release checks
        run: npm run release:check

      - name: Package extension
        run: npm run package

      - name: Verify tag matches manifest
        shell: bash
        run: |
          VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
          test "${GITHUB_REF_NAME}" = "v${VERSION}"

      - name: Verify archive integrity
        shell: bash
        run: |
          ZIP=$(find dist -maxdepth 1 -name 'ArSonKuPik-v*-chrome-web-store.zip' -print -quit)
          test -n "$ZIP"
          unzip -t "$ZIP"

      - name: Create GitHub release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          files: |
            dist/ArSonKuPik-v*-chrome-web-store.zip
            dist/SHA256SUMS.txt
""",
        encoding="utf-8",
    )
    (ROOT / ".github/dependabot.yml").write_text(
        """version: 2
updates:
  - package-ecosystem: github-actions
    directory: "/"
    schedule:
      interval: monthly
    labels:
      - dependencies
      - github-actions
    open-pull-requests-limit: 5
""",
        encoding="utf-8",
    )


def update_packaging() -> None:
    path = ROOT / "scripts/package_extension.py"
    text = path.read_text(encoding="utf-8")
    text = text.replace(
        'INCLUDE_DIRS = ["icons", "src"]',
        '''INCLUDE_DIRS = ["src"]
INCLUDE_ICON_FILES = [
    "icons/favicon.ico",
    "icons/icon-16.png",
    "icons/icon-32.png",
    "icons/icon-48.png",
    "icons/icon-128.png",
    "icons/icon-256.png",
    "icons/icon-512.png",
]''',
    )
    text = text.replace(
        'files = [ROOT / name for name in INCLUDE_ROOT_FILES]',
        'files = [ROOT / name for name in INCLUDE_ROOT_FILES]\n    files.extend(ROOT / name for name in INCLUDE_ICON_FILES)',
    )
    path.write_text(text, encoding="utf-8")


def update_validator() -> None:
    path = ROOT / "scripts/validate.py"
    text = path.read_text(encoding="utf-8")
    text = text.replace(
        "REQUIRED_FILES = [",
        '''PROJECT_REPOSITORY_URL = "https://github.com/masarray/arsonkupik-extension"
PROJECT_PAGES_URL = "https://masarray.github.io/arsonkupik-extension/"
PROJECT_PRIVACY_URL = f"{PROJECT_PAGES_URL}privacy.html"
PROJECT_SUPPORT_URL = f"{PROJECT_PAGES_URL}id/dukung.html"
LEGACY_PROJECT_URLS = (
    "https://github.com/masarray/" + "ArSonKuPik",
    "https://masarray.github.io/" + "ArSonKuPik/",
)

REQUIRED_FILES = [''',
        1,
    )
    text = text.replace(
        '    support_url = "https://masarray.github.io/arsonkupik-extension/id/dukung.html"',
        "    support_url = PROJECT_SUPPORT_URL",
    )
    text = text.replace(
        '        if manifest.get("homepage_url") != "https://masarray.github.io/arsonkupik-extension/":',
        '        if manifest.get("homepage_url") != PROJECT_PAGES_URL:',
    )
    needle = '    note(f"Indonesia QRIS support flow validated (enabled={qris_enabled})")\n    validate_site(failures)'
    replacement = '''    note(f"Indonesia QRIS support flow validated (enabled={qris_enabled})")

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

    validate_site(failures)'''
    if needle not in text:
        raise RuntimeError("Validator insertion point not found")
    text = text.replace(needle, replacement)
    path.write_text(text, encoding="utf-8")


def main() -> None:
    replace_project_urls()
    replace_in(".github/ISSUE_TEMPLATE/bug_report.yml", "placeholder: 0.3.100", "placeholder: 0.3.102")
    replace_in("docs/index.html", "Studio interface · v0.3.101", "Studio interface · v0.3.102")
    replace_in("docs/id/index.html", '"softwareVersion": "0.3.101"', '"softwareVersion": "0.3.102"')
    replace_in("docs/id/index.html", "Studio interface · v0.3.101", "Studio interface · v0.3.102")
    replace_in("REPOSITORY_SETUP.md", "ArSonKuPik 0.3.101", "ArSonKuPik 0.3.102")
    replace_in("REPOSITORY_SETUP.md", "`v0.3.101`", "`v0.3.102`")
    replace_in("THIRD_PARTY_NOTICES.md", "ArSonKuPik 0.3.101", "ArSonKuPik 0.3.102")
    funding = ROOT / ".github/FUNDING.yml"
    if funding.exists():
        funding.unlink()
    for generated in (
        ROOT / "dist/ArSonKuPik-v0.3.102-chrome-web-store.zip",
        ROOT / "dist/SHA256SUMS.txt",
    ):
        if generated.exists():
            generated.unlink()
    write_workflows()
    update_packaging()
    update_validator()
    replace_in(
        "scripts/smoke_support.mjs",
        r"/https:\/\/masarray\.github\.io\/ArSonKuPik\/id\/dukung\.html/",
        r"/https:\/\/masarray\.github\.io\/arsonkupik-extension\/id\/dukung\.html/",
    )
    print("Repository relocation and CI migration applied.")


if __name__ == "__main__":
    main()
