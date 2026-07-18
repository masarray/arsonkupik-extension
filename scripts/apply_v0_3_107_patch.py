#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION_OLD = "0.3.106"
VERSION_NEW = "0.3.107"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one {label}; found {count}")
    return text.replace(old, new, 1)


def patch_offscreen() -> None:
    path = "src/offscreen/offscreen.js"
    text = read(path)
    if "function createSilentMeters()" in text:
        return
    anchor = """function chooseMeterFftSize(mode = DEFAULT_PERFORMANCE_MODE) {
  return getPerfConfig(mode).meterFftSize;
}

let engine = null;
"""
    replacement = """function chooseMeterFftSize(mode = DEFAULT_PERFORMANCE_MODE) {
  return getPerfConfig(mode).meterFftSize;
}

function createSilentMeters() {
  return {
    inputPeak: 0,
    outputPeak: 0,
    gainReduction: 0,
    compressorGainReduction: 0,
    compressorGainReductionLeft: 0,
    compressorGainReductionRight: 0,
    limiterGainReduction: 0,
    inputPeakLeft: 0,
    inputPeakRight: 0,
    outputPeakLeft: 0,
    outputPeakRight: 0,
    correlation: 1,
    inputCorrelation: 1,
    inputStereoWidth: 0,
    widthAdaptiveFactor: 0.35,
    stereoBands: {
      low: { width: 0, correlation: 1 },
      mid: { width: 0, correlation: 1 },
      high: { width: 0, correlation: 1 }
    },
    clipping: false,
    smartHeadroomDb: 0,
    smartMakeupDb: 0,
    dopamineToneMap: null,
    adaptiveRuntime: 'idle',
    performanceMode: DEFAULT_PERFORMANCE_MODE,
    adaptiveUpdatedAt: 0
  };
}

let engine = null;
"""
    write(path, replace_once(text, anchor, replacement, "offscreen meter helper insertion point"))


def patch_popup_css() -> None:
    path = "src/popup/popup.css"
    text = read(path)
    broken = """.preset-select-row select,

.preset-select-row select:focus,

.preset-select-row select option,

.compact-controls {
  display: grid;
  gap: 10px;
}
"""
    fixed = """.preset-select-row select {
  width: 100%;
  min-height: 44px;
  appearance: none;
  -webkit-appearance: none;
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  padding: 0 44px 0 14px;
  background:
    linear-gradient(180deg, rgba(28, 35, 50, .96), rgba(11, 16, 25, .98));
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -.01em;
  cursor: pointer;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.07),
    0 8px 20px rgba(0,0,0,.18);
  transition: border-color .16s ease, box-shadow .16s ease, background .16s ease;
}

.preset-select-row select:hover {
  border-color: rgba(112, 234, 216, .34);
  background:
    linear-gradient(180deg, rgba(32, 41, 58, .98), rgba(12, 18, 28, .99));
}

.preset-select-row select:focus,
.preset-select-row select:focus-visible {
  border-color: rgba(112, 234, 216, .72);
  outline: none;
  box-shadow:
    0 0 0 3px rgba(112, 234, 216, .12),
    inset 0 1px 0 rgba(255,255,255,.09),
    0 10px 24px rgba(0,0,0,.22);
}

.preset-select-row select:disabled {
  cursor: not-allowed;
  opacity: .55;
}

.preset-select-row select option {
  background: #0b0f17;
  color: #f7f9fc;
  font-weight: 600;
}

.preset-select-row:focus-within::after {
  border-color: var(--accent-2);
}

.compact-controls {
  display: grid;
  gap: 10px;
}
"""
    write(path, replace_once(text, broken, fixed, "broken preset select CSS block"))


def write_runtime_test() -> None:
    content = """import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const offscreen = read('src/offscreen/offscreen.js');
const popupCss = read('src/popup/popup.css');

const helperIndex = offscreen.indexOf('function createSilentMeters()');
const firstUseIndex = offscreen.indexOf('createSilentMeters()');
assert.ok(helperIndex >= 0, 'Offscreen runtime must define createSilentMeters().');
assert.equal(firstUseIndex, helperIndex + 'function '.length, 'The first createSilentMeters reference must be its function declaration.');
assert.match(offscreen, /destroyMonitoringNodes\(\)[\s\S]*?this\.state\.meters\s*=\s*createSilentMeters\(\)/);
assert.match(offscreen, /getPublicState\(metersOverride\s*=\s*null\)[\s\S]*?createSilentMeters\(\)/);

assert.match(popupCss, /\.preset-select-row select\s*\{[\s\S]*?appearance:\s*none;/);
assert.match(popupCss, /\.preset-select-row select option\s*\{[\s\S]*?background:\s*#0b0f17;/);
assert.match(popupCss, /\.preset-select-row:focus-within::after/);
assert.doesNotMatch(
  popupCss,
  /\.preset-select-row select,\s*\.preset-select-row select:focus,/,
  'Preset select styling must not collapse into an empty comma-separated selector.'
);

console.log('Runtime startup helper and popup preset styling regression test passed.');
"""
    write("scripts/smoke_runtime_startup.mjs", content)


def patch_json_versions() -> None:
    manifest_path = ROOT / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["version"] = VERSION_NEW
    manifest["version_name"] = VERSION_NEW
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    package_path = ROOT / "package.json"
    package = json.loads(package_path.read_text(encoding="utf-8"))
    package["version"] = VERSION_NEW
    test_cmd = "node scripts/smoke_runtime_startup.mjs"
    for key in ("check", "release:check"):
        if test_cmd not in package["scripts"][key]:
            package["scripts"][key] += f" && {test_cmd}"
    package["scripts"]["test:runtime-startup"] = test_cmd
    package_path.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")

    release_path = ROOT / ".release/release.json"
    release = json.loads(release_path.read_text(encoding="utf-8"))
    release.update({
        "tag": f"v{VERSION_NEW}",
        "version": VERSION_NEW,
        "title": f"ArSonKuPik Extension v{VERSION_NEW}"
    })
    release_path.write_text(json.dumps(release, indent=2) + "\n", encoding="utf-8")


def patch_public_versions() -> None:
    for path in ("README.md", "docs/index.html", "docs/id/index.html"):
        text = read(path)
        if VERSION_OLD not in text:
            raise RuntimeError(f"Expected current version in {path}")
        write(path, text.replace(VERSION_OLD, VERSION_NEW))


def patch_changelog() -> None:
    path = "CHANGELOG.md"
    text = read(path)
    marker = "## [Unreleased]\n"
    section = """## [Unreleased]

## [0.3.107] - 2026-07-18

### Added

- Runtime-startup regression test covering the offscreen silent-meter helper and popup preset selector styling.

### Fixed

- Restored the missing `createSilentMeters()` helper in the offscreen audio engine, preventing startup from failing before tab capture begins.
- Restored the complete Quick Preset selector CSS block so the popup dropdown uses the intended full-width premium dark styling.

"""
    text = replace_once(text, marker, section, "changelog Unreleased heading")
    text = text.replace(
        "[Unreleased]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.106...HEAD",
        "[Unreleased]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.107...HEAD\n[0.3.107]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.106...v0.3.107"
    )
    write(path, text)


def write_release_audit() -> None:
    write("RELEASE_AUDIT_0.3.107.md", """# ArSonKuPik v0.3.107 Release Audit

## Runtime blocker fixed

The offscreen audio engine referenced `createSilentMeters()` during startup cleanup and public-state fallback, but the helper existed only in the service worker. Because `start()` begins by calling `stop(false)`, the undefined reference could abort every enhancement attempt before tab capture was established.

v0.3.107 defines a complete silent-meter state inside the offscreen module and adds a regression test that requires the declaration to appear before every runtime use.

## Popup preset selector

The Quick Preset selector CSS contained an incomplete comma-separated selector block with no declarations. The browser therefore displayed the platform default select control. v0.3.107 restores full-width dark styling, hover/focus states, a custom arrow, accessible focus visibility, and dark option colors.

## Release gate

The release must pass repository validation, privacy/support tests, audio stability, headless playback, update queues, global state scheduling, runtime startup regression, deterministic packaging, ZIP integrity, and checksum verification before publication.
""")


def main() -> None:
    patch_offscreen()
    patch_popup_css()
    write_runtime_test()
    patch_json_versions()
    patch_public_versions()
    patch_changelog()
    write_release_audit()
    print("Applied ArSonKuPik v0.3.107 runtime startup and popup selector hotfix.")


if __name__ == "__main__":
    main()
