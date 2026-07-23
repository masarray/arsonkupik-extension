# Chrome Web Store Privacy Disclosure — ArSonKuPik 0.3.112

Keep the Developer Dashboard, public policy, listing, manifest, screenshots, and shipped runtime consistent.

## Single purpose

ArSonKuPik provides user-initiated, local, real-time audio enhancement for one selected browser tab, including equalization, dynamics, harmonic processing, stereo shaping, limiting, metering, and presets.

## Data-use declarations

### Website content

**Declare handling: Yes.**

The selected tab's audio is transiently processed on the user's device after the user starts Enhance. Audio is not recorded, retained, uploaded, sold, shared, used for analytics, or used for advertising.

### Web history / browsing activity

**Declare handling: Yes, limited to active or captured tab metadata required for functionality.**

ArSonKuPik may read the selected tab URL and title to identify the source and can derive a normalized hostname for an optional per-site enhancement preference. It does not collect a browsing-history feed, page paths, query strings, or unrelated-tab records. Saved preferences remain local.

### Authentication, financial, health, location, personal communications, and personally identifiable information

**Declare handling: No.**

### Device and configuration data

Settings, custom presets, consent metadata, manual language choice, active-capture coordination state, and normalized per-site enhancement preferences may be stored locally. The extension does not read or store speaker identifiers or named output routes.

## Permitted purposes

Select only:

- App functionality.
- User customization.

Do not select advertising, analytics, profiling, creditworthiness, or unrelated product improvement.

## Permission justifications

- `activeTab`: limits user-triggered access to the currently selected tab.
- `tabCapture`: obtains audio from the selected tab after the user starts Enhance.
- `offscreen`: hosts the local Web Audio graph while the popup is closed.
- `storage`: saves settings, presets, consent, language choice, and optional per-site preferences locally.

The extension declares no host permissions, microphone permission, or location permission.

## User-facing disclosure

Before first use, the popup states that tab audio is processed only on the device, is never recorded or uploaded, and that a current-site hostname can be stored locally when per-site preferences are used. The background worker rejects `START_ENHANCE` until the user accepts this notice.

## Optional support page

- The support page opens only after an explicit click on **Support ArSonKuPik**.
- There is no automatic reminder, Studio gate, payment SDK, transaction tracking, or feature unlock.
- No audio, browsing activity, tab metadata, settings, identifiers, or payment information is attached to the navigation.
- All core features remain free.

## Deletion controls

- **Clear Site Preferences** removes saved per-site enhancement preferences.
- **Reset All Local Data** stops capture and removes extension-local settings, presets, language choice, site preferences, and consent.

## Mandatory dashboard corrections for the 0.3.112 update

The currently published item discloses Website content but does not visibly list limited browsing activity. Before submitting 0.3.112:

1. Keep **Website content** selected.
2. Add **Web history / browsing activity** for active/captured tab URL, title, and normalized hostname handling.
3. Select only **App functionality** and **User customization** as purposes.
4. Confirm all sale, advertising, unrelated-use, and creditworthiness certifications remain negative.
5. Confirm the privacy-policy URL points to the live 0.3.112-aligned policy.

## Submission verification

1. Run `npm run release:check`.
2. Run `npm run package`; it must also pass `validate_release_artifact.py`.
3. Confirm `manifest.json` is at the ZIP root.
4. Confirm `_locales/en/messages.json` and `_locales/id/messages.json` are inside the ZIP.
5. Test consent, Enhance, presets, Studio, language switching, deletion controls, and restart behavior in a new Chrome profile.
6. Confirm the public privacy-policy URL is live and matches this build.
7. Confirm the listing and screenshots do not mention output-device routing or stored output routes.
8. In Privacy Practices, declare Website content and limited browsing activity as described above.
