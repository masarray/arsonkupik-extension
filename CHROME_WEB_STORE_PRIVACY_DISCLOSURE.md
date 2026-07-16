# Chrome Web Store Privacy Disclosure

This document is the submission checklist for the Chrome Web Store Privacy Practices section. It must remain consistent with `manifest.json`, `PRIVACY.md`, and the shipped runtime. Dashboard labels can change; verify the final wording in the Chrome Web Store dashboard before submission.

## Single purpose

ArSonKuPik provides user-initiated, local, real-time audio enhancement for a selected browser tab, including equalization, dynamics, harmonic processing, stereo shaping, limiting, metering, presets, and supported system-default playback.

## Data-use declarations

### Web history / browsing activity

**Declare handling:** Yes, limited to the active or captured tab metadata needed for functionality.

ArSonKuPik reads the selected tab URL to derive a normalized hostname for optional per-site preferences. It does not collect a browsing-history feed, page paths, query strings, or browsing records from unrelated tabs. Saved records remain local in Chrome extension storage.

### Website content

**Declare handling:** No.

The extension does not read or store page text, images, form contents, messages, passwords, cookies, or DOM content.

### Authentication, financial, health, location, personal communications, and personally identifiable information

**Declare handling:** No, based on the current runtime.

### Audio

Browser-tab audio is processed transiently and locally after a user action. It is not recorded, uploaded, retained, sold, or shared.

### Device and configuration data

Audio-output identifiers and labels exposed by the browser or operating system may be stored locally to restore a selected route. General settings, custom presets, consent metadata, and normalized per-site preferences are also stored locally.

## Permitted purposes

Select only purposes equivalent to:

- App functionality.
- User customization.

Do not select advertising, analytics, profiling, creditworthiness, or unrelated product improvement.

## Required certifications

The maintainer should certify that user data is not:

- Sold to third parties.
- Used or transferred for personalized advertising.
- Used or transferred for creditworthiness or lending purposes.
- Used for purposes unrelated to the extension's single purpose.
- Transferred except as necessary to comply with law, protect users, or perform a user-requested action.

## Permission justifications

- `activeTab`: access is limited to the tab selected by the user.
- `tabCapture`: obtains audio from the selected tab after the user starts enhancement.
- `offscreen`: hosts the local Web Audio graph while the popup is closed.
- `storage`: keeps settings, presets, consent, device routes, and per-site preferences locally.

The extension declares no host permissions, no `contentSettings` permission, and no microphone permission.

## User-facing disclosure

Before first use, the popup states:

> Tab audio is processed only on this device and is never recorded or uploaded. When per-site preferences are used, the current site hostname and selected playback preference may be stored locally in this Chrome profile.

The user must choose **Accept & Continue** before `START_ENHANCE` is accepted by the background service worker.

## Optional support-page disclosure

- The support page opens only after an explicit user click.
- No browsing activity, tab metadata, audio, extension settings, user identifier, or payment information is attached to the navigation.
- The extension does not receive transaction status or identify supporters.
- Core features are not conditioned on support.

## Deletion controls

The popup exposes:

- **Clear Site Preferences** — removes per-site enhancement preferences and per-domain preferences.
- **Reset All Local Data** — removes all extension-local configuration and consent after stopping capture.

## Submission verification

Before every Web Store upload:

1. Run `npm run release:check`.
2. Confirm `manifest.json` has no undeclared permission.
3. Search the runtime for analytics, telemetry, remote code, microphone access, and network calls.
4. Test the first-use consent gate in a new Chrome profile.
5. Test both deletion controls and confirm storage contents are removed as described.
6. Confirm the public privacy-policy URL is live and matches the submitted build.
