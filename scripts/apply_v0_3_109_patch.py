#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD = "0.3.108"
NEW = "0.3.109"
QR_PAYLOAD = "00020101021126610014COM.GO-JEK.WWW01189360091439191940880210G9191940880303UMI51440014ID.CO.QRIS.WWW0215ID10265514017750303UMI5204899953033605802ID5925Sonkupik, Audio Developer6005BOGOR61051692362070703A016304DB67"
QR_SVG_SHA256 = "79339bcc248eafbfe5db259779bce90f60add55bbc80ce2ee8d82d5b9665d325"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Missing patch anchor: {label}")
    return text.replace(old, new, 1)


# Version metadata.
manifest = json.loads(read("manifest.json"))
manifest["version"] = NEW
manifest["version_name"] = NEW
write("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")

package = json.loads(read("package.json"))
package["version"] = NEW
for key in ("check", "release:check"):
    if "scripts/smoke_support_prompt.mjs" not in package["scripts"][key]:
        package["scripts"][key] += " && node scripts/smoke_support_prompt.mjs"
package["scripts"]["test:support-prompt"] = "node scripts/smoke_support_prompt.mjs"
write("package.json", json.dumps(package, indent=2, ensure_ascii=False) + "\n")

release = json.loads(read(".release/release.json"))
release.update({"tag": f"v{NEW}", "version": NEW, "title": f"ArSonKuPik Extension v{NEW}"})
write(".release/release.json", json.dumps(release, indent=2, ensure_ascii=False) + "\n")

for path in ("docs/index.html", "docs/id/index.html"):
    write(path, read(path).replace(OLD, NEW))

readme = read("README.md").replace(f"`{OLD}`", f"`{NEW}`")
write("README.md", readme)

changelog = read("CHANGELOG.md")
entry = f"""## [{NEW}] - 2026-07-18

### Added

- Optional static QRIS support dialog inside the popup, available immediately from the Support button and shown automatically only after 90 days from the first successful Enhance session.
- Local-only reminder controls: remind again after 30 days or permanently hide the prompt on the current Chrome profile after the user confirms support.
- Scan-verified local QRIS SVG for `Sonkupik, Audio Developer`, NMID `ID1026551401775`, with no remote image or payment API.
- Support-prompt regression checks covering timing, local persistence, disclosure copy, QR payload metadata, and absence of transaction tracking.

### Changed

- Voluntary support remains completely optional and never unlocks, limits, or changes audio features.

"""
changelog = replace_once(changelog, "## [Unreleased]\n\n", "## [Unreleased]\n\n" + entry, "changelog insertion")
write("CHANGELOG.md", changelog)

# Make QR payload auditable without any network call.
svg = read("src/popup/qris-support.svg")
if 'id="qris-payload"' not in svg:
    svg = replace_once(svg, "</desc>", f'</desc><metadata id="qris-payload">{QR_PAYLOAD}</metadata>', "QR payload metadata")
write("src/popup/qris-support.svg", svg)

# Popup markup.
popup_html = read("popup.html")
modal = """
  <div id="supportModal" class="support-modal" hidden aria-hidden="true">
    <button id="supportModalBackdrop" class="support-modal-backdrop" type="button" aria-label="Close support dialog"></button>
    <section class="support-modal-card" role="dialog" aria-modal="true" aria-labelledby="supportModalTitle" aria-describedby="supportModalDescription">
      <button id="supportModalCloseButton" class="support-modal-close" type="button" aria-label="Close support dialog">×</button>
      <span class="support-modal-kicker">Optional support · QRIS Indonesia</span>
      <h2 id="supportModalTitle">Support SonkuPik development</h2>
      <p id="supportModalDescription">ArSonKuPik stays fully functional and free. After 90 days of use, this optional reminder helps fund continued DSP development, testing, and support.</p>
      <div class="support-qris-frame">
        <img id="supportQrisImage" src="src/popup/qris-support.svg" width="280" height="306" alt="Static QRIS for voluntary SonkuPik support">
      </div>
      <div class="support-merchant">
        <strong>SonkuPik, Audio Developer</strong>
        <span>NMID ID1026551401775 · Bogor</span>
      </div>
      <p class="support-local-note">Payments are not tracked by the extension. “I’ve supported” only hides this reminder on the current Chrome profile.</p>
      <div class="support-modal-actions">
        <button id="supportLaterButton" class="secondary-button" type="button">Remind me in 30 days</button>
        <button id="supportConfirmedButton" class="primary-button" type="button">I’ve supported</button>
      </div>
      <button id="supportPageButton" class="text-button support-page-button" type="button">Open full support page</button>
    </section>
  </div>
"""
popup_html = replace_once(popup_html, "\n  <div id=\"soundModeToast\"", modal + "\n  <div id=\"soundModeToast\"", "support modal markup")
write("popup.html", popup_html)

# Popup behavior.
popup_js = read("src/popup/popup.js")
popup_js = replace_once(
    popup_js,
    "  supportDevelopmentButton: document.getElementById('supportDevelopmentButton')\n};",
    """  supportDevelopmentButton: document.getElementById('supportDevelopmentButton'),
  supportModal: document.getElementById('supportModal'),
  supportModalBackdrop: document.getElementById('supportModalBackdrop'),
  supportModalCloseButton: document.getElementById('supportModalCloseButton'),
  supportLaterButton: document.getElementById('supportLaterButton'),
  supportConfirmedButton: document.getElementById('supportConfirmedButton'),
  supportPageButton: document.getElementById('supportPageButton')
};""",
    "popup UI references",
)
popup_js = replace_once(
    popup_js,
    "const MASARI_PRESET_LABEL = 'MasAri';",
    """const MASARI_PRESET_LABEL = 'MasAri';
const DAY_MS = 24 * 60 * 60 * 1000;
const SUPPORT_PROMPT_DELAY_MS = 90 * DAY_MS;
const SUPPORT_REMINDER_DELAY_MS = 30 * DAY_MS;
const SUPPORT_PROMPT_STORAGE_KEY = 'arsonkupikSupportPrompt';
let supportModalAutomatic = false;""",
    "support constants",
)
popup_js = replace_once(
    popup_js,
    "  await refreshState();\n}",
    "  await refreshState();\n  await maybeShowSupportPrompt();\n}",
    "popup init support check",
)
popup_js = replace_once(
    popup_js,
    "      await refreshState();\n      showSoundModeToast(toastMode);",
    """      await refreshState();
      if (shouldAttachThisTab && state?.active) await recordSuccessfulEnhanceUsage();
      showSoundModeToast(toastMode);""",
    "record first successful enhance",
)
popup_js = replace_once(
    popup_js,
    """  ui.supportDevelopmentButton?.addEventListener('click', () => {
    openSupportPage().catch((error) => setHint(error.message));
  });""",
    """  ui.supportDevelopmentButton?.addEventListener('click', () => showSupportPrompt({ automatic: false }));
  ui.supportModalCloseButton?.addEventListener('click', () => closeSupportPrompt({ snooze: supportModalAutomatic }));
  ui.supportModalBackdrop?.addEventListener('click', () => closeSupportPrompt({ snooze: supportModalAutomatic }));
  ui.supportLaterButton?.addEventListener('click', () => closeSupportPrompt({ snooze: true }));
  ui.supportConfirmedButton?.addEventListener('click', confirmSupportLocally);
  ui.supportPageButton?.addEventListener('click', () => openSupportPage().catch((error) => setHint(error.message)));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && ui.supportModal && !ui.supportModal.hidden) {
      closeSupportPrompt({ snooze: supportModalAutomatic });
    }
  });""",
    "support event handlers",
)
helpers = r'''

async function readSupportPromptState() {
  const result = await chrome.storage.local.get(SUPPORT_PROMPT_STORAGE_KEY);
  return result?.[SUPPORT_PROMPT_STORAGE_KEY] || {};
}

async function writeSupportPromptState(next) {
  await chrome.storage.local.set({ [SUPPORT_PROMPT_STORAGE_KEY]: next });
  return next;
}

async function recordSuccessfulEnhanceUsage() {
  const current = await readSupportPromptState();
  if (Number(current.firstSuccessfulEnhanceAt) > 0) return current;
  const now = Date.now();
  return writeSupportPromptState({
    ...current,
    firstSuccessfulEnhanceAt: now,
    nextPromptAt: now + SUPPORT_PROMPT_DELAY_MS,
    permanentlyDismissed: false
  });
}

async function maybeShowSupportPrompt() {
  if (!state?.privacy?.accepted) return;
  let current = await readSupportPromptState();
  if (!Number(current.firstSuccessfulEnhanceAt) && state?.active) {
    current = await recordSuccessfulEnhanceUsage();
  }
  if (current.permanentlyDismissed) return;
  const firstAt = Number(current.firstSuccessfulEnhanceAt || 0);
  if (!firstAt) return;
  const dueAt = Math.max(firstAt + SUPPORT_PROMPT_DELAY_MS, Number(current.nextPromptAt || 0));
  if (Date.now() >= dueAt) showSupportPrompt({ automatic: true });
}

function showSupportPrompt({ automatic = false } = {}) {
  if (!ui.supportModal) return;
  supportModalAutomatic = automatic;
  ui.supportModal.hidden = false;
  ui.supportModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('support-modal-open');
  requestAnimationFrame(() => ui.supportModalCloseButton?.focus());
}

async function closeSupportPrompt({ snooze = false } = {}) {
  if (snooze) {
    const current = await readSupportPromptState();
    await writeSupportPromptState({
      ...current,
      nextPromptAt: Date.now() + SUPPORT_REMINDER_DELAY_MS,
      lastDismissedAt: Date.now()
    });
  }
  supportModalAutomatic = false;
  if (ui.supportModal) {
    ui.supportModal.hidden = true;
    ui.supportModal.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('support-modal-open');
}

async function confirmSupportLocally() {
  const current = await readSupportPromptState();
  await writeSupportPromptState({
    ...current,
    permanentlyDismissed: true,
    supporterConfirmedAt: Date.now(),
    nextPromptAt: null
  });
  await closeSupportPrompt({ snooze: false });
  setHint('Thank you for supporting SonkuPik. This reminder is disabled on this Chrome profile.');
}
'''
popup_js = replace_once(popup_js, "\nasync function refreshState() {", helpers + "\nasync function refreshState() {", "support helpers")
write("src/popup/popup.js", popup_js)

# Popup styles.
css = read("src/popup/popup.css")
css += r'''

/* Optional local QRIS support reminder. */
body.support-modal-open { overflow: hidden; }
.support-modal[hidden] { display: none !important; }
.support-modal {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  padding: 8px;
}
.support-modal-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(2, 5, 10, .84);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.support-modal-card {
  position: relative;
  z-index: 1;
  width: min(100%, 324px);
  max-height: calc(100vh - 16px);
  overflow: auto;
  display: grid;
  gap: 10px;
  padding: 16px;
  border: 1px solid rgba(255,255,255,.13);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(15,20,31,.99), rgba(7,11,18,.99));
  box-shadow: 0 24px 70px rgba(0,0,0,.58), inset 0 1px 0 rgba(255,255,255,.05);
}
.support-modal-close {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(255,255,255,.11);
  border-radius: 999px;
  background: rgba(255,255,255,.05);
  color: #dce4ef;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
}
.support-modal-kicker {
  padding-right: 36px;
  color: var(--accent-2);
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.support-modal-card h2 {
  margin: 0;
  padding-right: 30px;
  font-size: 19px;
  line-height: 1.15;
  letter-spacing: -.03em;
}
.support-modal-card > p {
  margin: 0;
  color: #aab4c5;
  font-size: 11.5px;
  line-height: 1.45;
}
.support-qris-frame {
  justify-self: center;
  width: min(100%, 238px);
  padding: 5px;
  border-radius: 16px;
  background: #f7f8fa;
  box-shadow: 0 10px 30px rgba(0,0,0,.34);
}
.support-qris-frame img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 12px;
}
.support-merchant {
  display: grid;
  gap: 3px;
  text-align: center;
}
.support-merchant strong { font-size: 12px; }
.support-merchant span { color: var(--muted); font-size: 10.5px; }
.support-local-note {
  padding: 9px 10px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 10px;
  background: rgba(255,255,255,.035);
  color: #929daf !important;
  font-size: 10px !important;
}
.support-modal-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.support-modal-actions .primary-button,
.support-modal-actions .secondary-button { min-height: 40px; height: auto; padding: 8px; font-size: 10.5px; }
.support-page-button { justify-self: center; }
'''
write("src/popup/popup.css", css)

# Privacy disclosure.
privacy = read("PRIVACY.md")
section = """

## Voluntary support reminder

The popup may store the timestamp of the first successful Enhance session, the next reminder date, and a local “I’ve supported” dismissal flag in `chrome.storage.local`. These values never leave the browser profile. ArSonKuPik does not verify payments, receive transaction status, or change feature access based on support.
"""
if "## Voluntary support reminder" not in privacy:
    privacy += section
write("PRIVACY.md", privacy)

# Regression test.
smoke = f'''import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const html = read('popup.html');
const js = read('src/popup/popup.js');
const css = read('src/popup/popup.css');
const svg = read('src/popup/qris-support.svg');
const privacy = read('PRIVACY.md');

for (const id of ['supportModal','supportModalCloseButton','supportLaterButton','supportConfirmedButton','supportPageButton','supportQrisImage']) {{
  assert.match(html, new RegExp(`id=["']${{id}}["']`), `missing popup support element ${{id}}`);
}}
assert.match(html, /ArSonKuPik stays fully functional and free/);
assert.match(html, /Payments are not tracked by the extension/);
assert.match(js, /SUPPORT_PROMPT_DELAY_MS = 90 \* DAY_MS/);
assert.match(js, /SUPPORT_REMINDER_DELAY_MS = 30 \* DAY_MS/);
assert.match(js, /firstSuccessfulEnhanceAt/);
assert.match(js, /permanentlyDismissed/);
assert.match(js, /supporterConfirmedAt/);
assert.match(js, /chrome\.storage\.local\.get/);
assert.match(js, /chrome\.storage\.local\.set/);
assert.match(js, /supportDevelopmentButton\?\.addEventListener\('click', \(\) => showSupportPrompt/);
assert.doesNotMatch(js, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/);
assert.match(css, /\.support-modal-card/);
assert.match(css, /\.support-qris-frame/);
assert.match(svg, /<metadata id="qris-payload">{QR_PAYLOAD}<\/metadata>/);
assert.equal(crypto.createHash('sha256').update(svg).digest('hex'), '{QR_SVG_SHA256}');
assert.match(privacy, /does not verify payments, receive transaction status, or change feature access/);
console.log('Static QRIS support prompt smoke test passed.');
'''
write("scripts/smoke_support_prompt.mjs", smoke)

# Release audit.
audit = f"""# ArSonKuPik v{NEW} Release Audit

## Scope

- Adds an optional static QRIS support dialog inside the popup.
- Starts the 90-day clock only after the first successful Enhance session.
- Allows a 30-day reminder delay or permanent local dismissal after self-confirmed support.
- Keeps all audio features available regardless of support status.

## Privacy and security

- No payment API, account, webhook, transaction lookup, analytics, or remote image.
- Support timestamps and dismissal state remain in `chrome.storage.local`.
- The extension cannot determine whether a payment occurred.
- QRIS SVG includes auditable payload metadata and is byte-pinned by CI.

## QRIS identity

- Merchant: Sonkupik, Audio Developer
- NMID: ID1026551401775
- City: BOGOR
- SVG SHA-256: `{QR_SVG_SHA256}`

## Manual gate

Test the popup on a clean profile, verify immediate manual opening from Support, simulate the 90-day timestamp in local storage, scan QRIS with at least two banking applications, and confirm all audio functions remain unaffected.
"""
write(f"RELEASE_AUDIT_{NEW}.md", audit)

print(f"Applied static QRIS popup patch for v{NEW}.")
