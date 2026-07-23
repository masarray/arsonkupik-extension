from __future__ import annotations

import json
from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected patch anchor not found in {path}: {old[:100]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


def replace_all(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected replacement token not found in {path}: {old!r}")
    file_path.write_text(text.replace(old, new), encoding="utf-8")


# ---------------------------------------------------------------------------
# Background command routing and bounded Brave browser APIs.
# ---------------------------------------------------------------------------
replace_once(
    "src/background/service-worker.js",
    "import { createStateCommandScheduler } from '../shared/state-command-scheduler.js';\n",
    "import { createStateCommandScheduler } from '../shared/state-command-scheduler.js';\n"
    "import { getBackgroundCommandLane } from '../shared/background-command-routing.js';\n",
)

replace_once(
    "src/background/service-worker.js",
    "function sleep(ms) {\n  return new Promise((resolve) => setTimeout(resolve, ms));\n}\n",
    "function sleep(ms) {\n  return new Promise((resolve) => setTimeout(resolve, ms));\n}\n\n"
    "async function settleBrowserApi(call, fallbackValue = null, timeoutMs = 900) {\n"
    "  try {\n"
    "    return await Promise.race([\n"
    "      Promise.resolve().then(call),\n"
    "      sleep(timeoutMs).then(() => fallbackValue)\n"
    "    ]);\n"
    "  } catch {\n"
    "    return fallbackValue;\n"
    "  }\n"
    "}\n\n"
    "function fireAndForgetBrowserApi(call) {\n"
    "  Promise.resolve().then(call).catch(() => {});\n"
    "}\n",
)

old_dispatch = """function dispatchBackgroundMessage(message, sender = null) {
  if (message.type === 'UPDATE_STATE') {
    return stateCommandScheduler.enqueuePatch(message.patch || {});
  }
  if (message.type === 'APPLY_PRESET') {
    // Rapid selector changes should not march through every obsolete preset.
    // Keep ordering against state patches, but collapse adjacent pending preset
    // requests so every caller receives the result of the newest selection.
    return stateCommandScheduler.enqueueLatestCommand(
      'apply-preset',
      () => handleBackgroundMessage(message, sender),
      { debounceMs: 90 }
    );
  }
  return stateCommandScheduler.enqueueCommand(() => handleBackgroundMessage(message, sender));
}
"""
new_dispatch = """function dispatchBackgroundMessage(message, sender = null) {
  const lane = getBackgroundCommandLane(message?.type);
  if (lane === 'patch') {
    return stateCommandScheduler.enqueuePatch(message.patch || {});
  }
  if (lane === 'latest-command') {
    // Rapid selector changes should not march through every obsolete preset.
    // Keep ordering against state patches, but collapse adjacent pending preset
    // requests so every caller receives the result of the newest selection.
    return stateCommandScheduler.enqueueLatestCommand(
      'apply-preset',
      () => handleBackgroundMessage(message, sender)
    );
  }
  if (lane === 'state-command') {
    return stateCommandScheduler.enqueueCommand(() => handleBackgroundMessage(message, sender));
  }
  // Read-only and browser-UI commands must never wait behind an unrelated
  // state mutation. This is critical on Brave, where a tab/session API can
  // remain pending after the Studio tab has already been created.
  return handleBackgroundMessage(message, sender);
}
"""
replace_once("src/background/service-worker.js", old_dispatch, new_dispatch)

replace_all("src/background/service-worker.js", "await rememberStudioTabId(", "rememberStudioTabId(")
replace_all("src/background/service-worker.js", "await clearStoredStudioTabId();", "clearStoredStudioTabId();")

replace_once(
    "src/background/service-worker.js",
    "  const created = await chrome.tabs.create({ url: desiredUrl, active: true });\n"
    "  rememberStudioTabId(created?.id || null);\n"
    "  return { ok: true, reused: false, tabId: studioTabId };\n",
    "  const created = await settleBrowserApi(\n"
    "    () => chrome.tabs.create({ url: desiredUrl, active: true }),\n"
    "    null,\n"
    "    2500\n"
    "  );\n"
    "  if (!created?.id) throw new Error('Brave did not finish creating the Studio tab. Reload the extension and try again.');\n"
    "  rememberStudioTabId(created.id);\n"
    "  return { ok: true, reused: false, tabId: created.id };\n",
)

replace_once(
    "src/background/service-worker.js",
    "  await chrome.tabs.update(tab.id, update);\n"
    "  if (tab.windowId && chrome.windows?.update) {\n"
    "    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});\n"
    "  }\n",
    "  const updated = await settleBrowserApi(() => chrome.tabs.update(tab.id, update), null, 1500);\n"
    "  if (!updated) throw new Error('Brave did not finish focusing the Studio tab.');\n"
    "  if (tab.windowId && chrome.windows?.update) {\n"
    "    fireAndForgetBrowserApi(() => chrome.windows.update(tab.windowId, { focused: true }));\n"
    "  }\n",
)

replace_once(
    "src/background/service-worker.js",
    "    const tab = await chrome.tabs.get(Number(tabId));\n"
    "    const tabUrl = tab?.pendingUrl || tab?.url || '';\n",
    "    const tab = await settleBrowserApi(() => chrome.tabs.get(Number(tabId)), null, 700);\n"
    "    if (!tab) return null;\n"
    "    const tabUrl = tab?.pendingUrl || tab?.url || '';\n",
)

replace_once(
    "src/background/service-worker.js",
    "    const contexts = await chrome.runtime.getContexts({ contextTypes: ['TAB'] });\n",
    "    const contexts = await settleBrowserApi(\n"
    "      () => chrome.runtime.getContexts({ contextTypes: ['TAB'] }),\n"
    "      [],\n"
    "      700\n"
    "    );\n",
)

replace_once(
    "src/background/service-worker.js",
    "    const tabs = await chrome.tabs.query({ url: `${studioUrl}*` });\n",
    "    const tabs = await settleBrowserApi(() => chrome.tabs.query({ url: `${studioUrl}*` }), [], 700);\n",
)

replace_once(
    "src/background/service-worker.js",
    "  await chrome.tabs.remove(duplicateIds).catch(() => {});\n",
    "  fireAndForgetBrowserApi(() => chrome.tabs.remove(duplicateIds));\n",
)

old_session = """async function getStoredStudioTabId() {
  if (!chrome.storage?.session) return studioTabId;
  try {
    const stored = await chrome.storage.session.get(STORE_KEYS.studioTabId);
    const tabId = Number(stored?.[STORE_KEYS.studioTabId]);
    return Number.isInteger(tabId) && tabId > 0 ? tabId : studioTabId;
  } catch {
    return studioTabId;
  }
}

async function rememberStudioTabId(tabId) {
  const id = Number(tabId);
  studioTabId = Number.isInteger(id) && id > 0 ? id : null;
  if (!chrome.storage?.session) return;
  if (studioTabId) {
    await chrome.storage.session.set({ [STORE_KEYS.studioTabId]: studioTabId }).catch(() => {});
  } else {
    await chrome.storage.session.remove(STORE_KEYS.studioTabId).catch(() => {});
  }
}

async function clearStoredStudioTabId() {
  studioTabId = null;
  if (chrome.storage?.session) await chrome.storage.session.remove(STORE_KEYS.studioTabId).catch(() => {});
}
"""
new_session = """async function getStoredStudioTabId() {
  if (studioTabId) return studioTabId;
  if (!chrome.storage?.session) return null;
  const stored = await settleBrowserApi(
    () => chrome.storage.session.get(STORE_KEYS.studioTabId),
    null,
    450
  );
  const tabId = Number(stored?.[STORE_KEYS.studioTabId]);
  return Number.isInteger(tabId) && tabId > 0 ? tabId : null;
}

function rememberStudioTabId(tabId) {
  const id = Number(tabId);
  studioTabId = Number.isInteger(id) && id > 0 ? id : null;
  if (!chrome.storage?.session) return studioTabId;
  if (studioTabId) {
    fireAndForgetBrowserApi(() => chrome.storage.session.set({ [STORE_KEYS.studioTabId]: studioTabId }));
  } else {
    fireAndForgetBrowserApi(() => chrome.storage.session.remove(STORE_KEYS.studioTabId));
  }
  return studioTabId;
}

function clearStoredStudioTabId() {
  studioTabId = null;
  if (chrome.storage?.session) {
    fireAndForgetBrowserApi(() => chrome.storage.session.remove(STORE_KEYS.studioTabId));
  }
}
"""
replace_once("src/background/service-worker.js", old_session, new_session)

# ---------------------------------------------------------------------------
# Studio renders a complete local fallback before asking the service worker.
# ---------------------------------------------------------------------------
replace_once(
    "src/studio/studio.js",
    "  PRIMARY_MASTER_PRESET_IDS\n} from '../shared/presets.js';\n",
    "  PRIMARY_MASTER_PRESET_IDS,\n  createDefaultState\n} from '../shared/presets.js';\n",
)

old_studio_init = """async function init() {
  sendMessage({ target: 'background', type: 'REGISTER_STUDIO' }).catch(() => {});
  document.addEventListener('visibilitychange', onStudioVisibilityChange);
  window.addEventListener('pagehide', () => setStudioMonitoringActive(false));
  buildSkeleton();
  bindUiEvents();
  await refreshState();
  layout();
  await setStudioMonitoringActive(!document.hidden);
  startCompLoop();
  startColorLoop();
  requestAnimationFrame(tickSpectrum);
}
"""
new_studio_init = """async function init() {
  sendMessage({ target: 'background', type: 'REGISTER_STUDIO' }).catch(() => {});
  document.addEventListener('visibilitychange', onStudioVisibilityChange);
  window.addEventListener('pagehide', () => setStudioMonitoringActive(false));
  buildSkeleton();
  bindUiEvents();
  applyFallbackState();
  layout();
  const refreshed = await refreshState();
  if (refreshed) layout();
  await setStudioMonitoringActive(!document.hidden);
  startCompLoop();
  startColorLoop();
  requestAnimationFrame(tickSpectrum);
}

function applyFallbackState() {
  state = createDefaultState();
  presets = [...FACTORY_PRESETS];
  bypassAll = Boolean(state.output?.bypass);
  loadBandsFromState(state.eq, true);
  renderChromeState();
  renderPresetDropdowns();
  renderCompressorControls();
  renderColorControls();
  renderWidthControls();
  renderOutputControls();
  drawCompressorCurve();
  updateRackState();
  updateMeters(state.meters || {});
}
"""
replace_once("src/studio/studio.js", old_studio_init, new_studio_init)

replace_once(
    "src/studio/studio.js",
    "  if (!next) return;\n  state = {\n",
    "  if (!next) return false;\n  state = {\n",
)
replace_once(
    "src/studio/studio.js",
    "  updateMeters(state.meters || {});\n}\n\nfunction loadBandsFromState",
    "  updateMeters(state.meters || {});\n  return true;\n}\n\nfunction loadBandsFromState",
)

# ---------------------------------------------------------------------------
# Popup also paints immediately and remains usable if GET_STATE is delayed.
# ---------------------------------------------------------------------------
replace_once(
    "src/popup/popup.js",
    "import { FACTORY_PRESETS, PRIMARY_MASTER_PRESET_IDS } from '../shared/presets.js';\n",
    "import { FACTORY_PRESETS, PRIMARY_MASTER_PRESET_IDS, createDefaultState } from '../shared/presets.js';\n",
)

replace_once(
    "src/popup/popup.js",
    "async function init() {\n  bindEvents();\n  await refreshState();\n}\n",
    "async function init() {\n  bindEvents();\n  applyFallbackState();\n  await refreshState();\n}\n\n"
    "function applyFallbackState() {\n"
    "  state = {\n"
    "    ...createDefaultState(),\n"
    "    currentTabId: null,\n"
    "    currentDomain: '',\n"
    "    captureDomain: '',\n"
    "    isCurrentTabCapture: false,\n"
    "    domainEnhanceEnabled: false,\n"
    "    privacy: {\n"
    "      accepted: false,\n"
    "      sitePreferenceCount: 0,\n"
    "      customPresetCount: 0\n"
    "    }\n"
    "  };\n"
    "  presets = [...FACTORY_PRESETS];\n"
    "  render();\n"
    "}\n",
)

replace_once(
    "src/popup/popup.js",
    "  if (!next) return;\n  state = next;\n",
    "  if (!next) return false;\n  state = next;\n",
)
replace_once(
    "src/popup/popup.js",
    "  render();\n}\n\n\nasync function startEnhanceWithAutoBypassOff",
    "  render();\n  return true;\n}\n\n\nasync function startEnhanceWithAutoBypassOff",
)

# ---------------------------------------------------------------------------
# Release metadata and test pipeline.
# ---------------------------------------------------------------------------
manifest_path = Path("manifest.json")
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
manifest["version"] = "0.3.113"
manifest["version_name"] = "0.3.113"
manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

package_path = Path("package.json")
package = json.loads(package_path.read_text(encoding="utf-8"))
package["version"] = "0.3.113"
extra = "node scripts/smoke_brave_studio_routing.mjs"
for key in ("check", "release:check"):
    if extra not in package["scripts"][key]:
        package["scripts"][key] += f" && {extra}"
package["scripts"]["test:brave-studio-routing"] = extra
package_path.write_text(json.dumps(package, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

lock_path = Path("package-lock.json")
lock = json.loads(lock_path.read_text(encoding="utf-8"))
lock["version"] = "0.3.113"
if "" in lock.get("packages", {}):
    lock["packages"][""]["version"] = "0.3.113"
lock_path.write_text(json.dumps(lock, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

release_path = Path(".release/release.json")
release = json.loads(release_path.read_text(encoding="utf-8"))
release.update({"tag": "v0.3.113", "version": "0.3.113", "title": "ArSonKuPik Extension v0.3.113", "prerelease": False})
release_path.write_text(json.dumps(release, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

for relative in ("docs/index.html", "docs/id/index.html"):
    replace_all(relative, "0.3.112", "0.3.113")
replace_all("README.md", "Current stable release: 0.3.112", "Current stable release: 0.3.113")

changelog_path = Path("CHANGELOG.md")
changelog = changelog_path.read_text(encoding="utf-8")
entry = """## [0.3.113] - 2026-07-23

### Fixed

- Routed `OPEN_STUDIO`, `REGISTER_STUDIO`, `GET_STATE`, and other UI/read commands outside the serialized state-mutation queue so a delayed Brave tab or session API cannot deadlock the whole extension.
- Added bounded Brave-safe tab/context/session calls and made Studio tab-session persistence fire-and-forget.
- Rendered complete local fallback controls in Popup and Studio before waiting for service-worker state, preventing blank shells during delayed background startup.

### Added

- Regression coverage for direct UI command routing, non-blocking Studio registration, and fallback rendering before `GET_STATE`.

"""
anchor = "## [0.3.112] - 2026-07-22\n"
if "## [0.3.113]" not in changelog:
    if anchor not in changelog:
        raise SystemExit("CHANGELOG 0.3.112 anchor not found")
    changelog = changelog.replace(anchor, entry + anchor, 1)
changelog = changelog.replace(
    "[Unreleased]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.112...HEAD",
    "[Unreleased]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.113...HEAD\n"
    "[0.3.113]: https://github.com/masarray/arsonkupik-extension/compare/v0.3.112...v0.3.113",
)
changelog_path.write_text(changelog, encoding="utf-8")

print("Applied Brave Studio deadlock hotfix 0.3.113.")
