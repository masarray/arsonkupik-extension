#!/usr/bin/env python3
"""Apply the audited v0.3.105 release-stability patch on the working branch."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.3.105"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if old not in text:
        raise RuntimeError(f"Expected text not found in {path}: {old[:100]!r}")
    write(path, text.replace(old, new, 1))


def update_json_version(path: str) -> None:
    data = json.loads(read(path))
    data["version"] = VERSION
    if path == "manifest.json":
        data["version_name"] = VERSION
    write(path, json.dumps(data, indent=2, ensure_ascii=False) + "\n")


update_json_version("manifest.json")
update_json_version("package.json")

package = json.loads(read("package.json"))
scripts = package["scripts"]
scripts["check"] = (
    "node scripts/check_repository_identity.mjs && "
    "node scripts/check_release_metadata.mjs && "
    "node scripts/run-python.mjs scripts/validate.py && "
    "node scripts/smoke_privacy.mjs && "
    "node scripts/smoke_support.mjs && "
    "node scripts/smoke_stability.mjs && "
    "node scripts/smoke_headless.mjs && "
    "node scripts/smoke_update_queue.mjs"
)
scripts["release:check"] = (
    "node scripts/check_repository_identity.mjs && "
    "node scripts/check_release_metadata.mjs && "
    "node scripts/run-python.mjs scripts/validate.py --release && "
    "node scripts/smoke_privacy.mjs && "
    "node scripts/smoke_support.mjs && "
    "node scripts/smoke_stability.mjs && "
    "node scripts/smoke_headless.mjs && "
    "node scripts/smoke_update_queue.mjs"
)
scripts["check:release-metadata"] = "node scripts/check_release_metadata.mjs"
scripts["test:update-queue"] = "node scripts/smoke_update_queue.mjs"
write("package.json", json.dumps(package, indent=2, ensure_ascii=False) + "\n")

release = {
    "tag": f"v{VERSION}",
    "version": VERSION,
    "title": f"ArSonKuPik Extension v{VERSION}",
    "prerelease": False,
}
write(".release/release.json", json.dumps(release, indent=2) + "\n")

queue_module = r'''function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function mergeLatestPatch(base = {}, incoming = {}) {
  if (!isPlainObject(base)) return structuredClone(incoming);
  if (!isPlainObject(incoming)) return structuredClone(incoming);

  const merged = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = mergeLatestPatch(merged[key], value);
    } else if (Array.isArray(value)) {
      merged[key] = value.map((entry) => structuredClone(entry));
    } else {
      merged[key] = structuredClone(value);
    }
  }
  return merged;
}

export function createLatestPatchQueue(sendPatch) {
  if (typeof sendPatch !== 'function') throw new TypeError('sendPatch must be a function.');

  let running = false;
  let pendingPatch = null;
  let pendingWaiters = [];

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (pendingPatch) {
        const patch = pendingPatch;
        const waiters = pendingWaiters;
        pendingPatch = null;
        pendingWaiters = [];

        try {
          const response = await sendPatch(patch);
          for (const waiter of waiters) waiter.resolve(response);
        } catch (error) {
          for (const waiter of waiters) waiter.reject(error);
        }
      }
    } finally {
      running = false;
      if (pendingPatch) queueMicrotask(drain);
    }
  }

  return function enqueueLatestPatch(patch) {
    return new Promise((resolve, reject) => {
      pendingPatch = mergeLatestPatch(pendingPatch || {}, patch || {});
      pendingWaiters.push({ resolve, reject });
      void drain();
    });
  };
}
'''
write("src/shared/latest-patch-queue.js", queue_module)

messaging = read("src/shared/messaging.js")
if "latest-patch-queue.js" not in messaging:
    messaging = "import { createLatestPatchQueue } from './latest-patch-queue.js';\n\n" + messaging
old_update = """export async function updateEngineState(patch) {
  return assertOk(await sendMessage({ target: 'background', type: 'UPDATE_STATE', patch }), 'Unable to update audio engine.');
}
"""
new_update = """const enqueueEngineStatePatch = createLatestPatchQueue(async (patch) => {
  return assertOk(await sendMessage({ target: 'background', type: 'UPDATE_STATE', patch }), 'Unable to update audio engine.');
});

export function updateEngineState(patch) {
  return enqueueEngineStatePatch(patch);
}
"""
if old_update not in messaging:
    raise RuntimeError("Unable to locate updateEngineState implementation")
write("src/shared/messaging.js", messaging.replace(old_update, new_update, 1))

queue_test = r'''import assert from 'node:assert/strict';
import { createLatestPatchQueue, mergeLatestPatch } from '../src/shared/latest-patch-queue.js';

const merged = mergeLatestPatch(
  { eq: { gain: 1, bands: [{ id: 1 }] }, output: { gainDb: 0 } },
  { eq: { gain: 2, bands: [{ id: 2 }] }, output: { ceilingDb: -1 } }
);
assert.deepEqual(merged, {
  eq: { gain: 2, bands: [{ id: 2 }] },
  output: { gainDb: 0, ceilingDb: -1 }
});

const sends = [];
const releases = [];
let active = 0;
let maxActive = 0;
const queue = createLatestPatchQueue((patch) => new Promise((resolve) => {
  active += 1;
  maxActive = Math.max(maxActive, active);
  sends.push(structuredClone(patch));
  releases.push(() => {
    active -= 1;
    resolve({ ok: true, patch });
  });
}));

const first = queue({ eq: { gain: 1, q: 0.7 } });
await new Promise(setImmediate);
assert.equal(sends.length, 1);

const second = queue({ eq: { gain: 2 }, output: { gainDb: -1 } });
const third = queue({ eq: { gain: 3, frequency: 1000 } });
const fourth = queue({ output: { ceilingDb: -0.5 } });
assert.equal(sends.length, 1, 'only one update may be in flight');

releases.shift()();
await new Promise(setImmediate);
assert.equal(sends.length, 2, 'rapid updates should be coalesced into one follow-up send');
assert.deepEqual(sends[1], {
  eq: { gain: 3, frequency: 1000 },
  output: { gainDb: -1, ceilingDb: -0.5 }
});
assert.equal(maxActive, 1, 'engine-state writes must remain serialized');

releases.shift()();
await Promise.all([first, second, third, fourth]);
assert.equal(active, 0);
console.log('Latest-value engine update queue smoke test passed.');
'''
write("scripts/smoke_update_queue.mjs", queue_test)

metadata_check = r'''import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const loadJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const manifest = loadJson('manifest.json');
const pkg = loadJson('package.json');
const release = loadJson('.release/release.json');
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');

assert.equal(pkg.version, manifest.version, 'package and manifest versions differ');
assert.equal(release.version, manifest.version, 'release descriptor and manifest versions differ');
assert.equal(release.tag, `v${manifest.version}`, 'release tag does not match manifest version');
assert.equal(release.title, `ArSonKuPik Extension v${manifest.version}`, 'release title is inconsistent');
assert.equal(typeof release.prerelease, 'boolean', 'release prerelease flag must be boolean');
assert.match(changelog, new RegExp(`^## \\[${manifest.version.replaceAll('.', '\\.') }\\]`, 'm'));
console.log(`Release metadata aligned for v${manifest.version}.`);
'''
write("scripts/check_release_metadata.mjs", metadata_check)

for test_path in ("scripts/smoke_stability.mjs", "scripts/smoke_headless.mjs"):
    text = read(test_path)
    if "0.3.104" not in text:
        raise RuntimeError(f"Expected previous version in {test_path}")
    write(test_path, text.replace("0.3.104", VERSION))

changelog = read("CHANGELOG.md")
entry = f'''## [{VERSION}] - 2026-07-17

### Added

- Serialized latest-value engine-state update queue with nested-patch coalescing and regression coverage.
- Release metadata guard that requires manifest, package, descriptor, tag, title, and changelog alignment.

### Changed

- GitHub Pages and core checkout/setup-node actions are pinned to verified release commits.
- Website output copy now matches direct system-default playback.

### Fixed

- Prevented rapid knob gestures from creating overlapping storage and offscreen update operations.
- Synchronized the release descriptor and public version metadata with the current runtime.

'''
needle = "## [Unreleased]\n\n"
if needle not in changelog:
    raise RuntimeError("CHANGELOG Unreleased heading not found")
changelog = changelog.replace(needle, needle + entry, 1)
changelog = changelog.replace(
    "[Unreleased]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.103...HEAD",
    f"[Unreleased]: https://github.com/masarray/arsonkupik-extension/compare/v{VERSION}...HEAD\n[{VERSION}]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.102...v{VERSION}",
)
changelog = changelog.replace(
    "[0.3.104]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.103...v0.3.104",
    "[0.3.104]: https://github.com/masarray/arsonkupik-extension/pull/12",
)
changelog = changelog.replace(
    "[0.3.103]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.102...v0.3.103",
    "[0.3.103]: https://github.com/masarray/arsonkupik-extension/pull/11",
)
write("CHANGELOG.md", changelog)

for path in ("README.md",):
    text = read(path)
    write(path, text.replace("0.3.104", VERSION))

readme = read("README.md")
readme = readme.replace(
    "A Node-based smoke test verifies consent gating, per-site deletion, and total local-data reset.",
    "Node-based smoke tests verify consent gating, per-site deletion, total local-data reset, audio stability, headless playback, and serialized latest-value engine updates.",
)
write("README.md", readme)

for path in sorted((ROOT / "docs").rglob("*.html")):
    text = path.read_text(encoding="utf-8").replace("0.3.104", VERSION)
    text = text.replace("Output safety and routing", "Output safety and playback")
    text = text.replace(
        "Manage gain, limiter protection, clipping feedback, and supported output devices from one consistent signal path.",
        "Manage gain, limiter protection, clipping feedback, and direct system-default playback from one consistent signal path.",
    )
    text = text.replace("Output safety dan routing", "Output safety dan playback")
    text = text.replace(
        "Gain staging, limiter, clipping feedback, dan pemilihan output device dalam satu alur.",
        "Atur gain staging, limiter, clipping feedback, dan playback langsung ke output default sistem dalam satu alur.",
    )
    path.write_text(text, encoding="utf-8")

architecture = read("ARCHITECTURE.md")
architecture = architecture.replace(
    "- Every state write is normalized before it reaches the audio graph or persistent storage.\n",
    "- Every state write is normalized before it reaches the audio graph or persistent storage.\n- Rapid UI edits pass through a serialized latest-value queue so only one engine update is in flight and newer nested patches are coalesced.\n",
)
write("ARCHITECTURE.md", architecture)

checkout_old = "actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4"
checkout_new = "actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7"
node_old = "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4"
node_new = "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7"
for path in sorted((ROOT / ".github/workflows").glob("*.yml")):
    text = path.read_text(encoding="utf-8")
    text = text.replace(checkout_old, checkout_new)
    text = text.replace("actions/checkout@v4", checkout_new)
    text = text.replace(node_old, node_new)
    text = text.replace("actions/configure-pages@v5", "actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6")
    text = text.replace("actions/upload-pages-artifact@v3", "actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5")
    text = text.replace("actions/deploy-pages@v4", "actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128 # v5")
    path.write_text(text, encoding="utf-8")

audit = f'''# Release Audit {VERSION}

## Scope

This release closes the final audit findings before Chrome Web Store submission:

- serializes and coalesces rapid engine-state updates;
- aligns manifest, package, changelog, descriptor, and release tag metadata;
- corrects system-default playback copy;
- pins GitHub Actions to verified commits;
- adds regression tests for update ordering and release metadata.

## Required checks

- `npm run check`
- `npm run release:check`
- deterministic package build
- ZIP integrity and SHA-256 verification
- manual Chrome playback stress test before Web Store submission

## Runtime privacy

Permissions remain limited to `activeTab`, `tabCapture`, `offscreen`, and `storage`. No host permissions, microphone permission, telemetry, remote runtime code, or cloud audio path are introduced.
'''
write(f"RELEASE_AUDIT_{VERSION}.md", audit)

print(f"Applied ArSonKuPik v{VERSION} release-stability patch.")
