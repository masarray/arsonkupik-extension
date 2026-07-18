# Privacy Policy

**Effective date:** July 15, 2026  
**Applies to:** ArSonKuPik 0.3.101 and later builds that reference this policy

ArSonKuPik is designed to process browser-tab audio locally on the user's device. Privacy controls are part of the extension, not only this document.

## First-use notice and consent

Before audio enhancement can start, ArSonKuPik displays a local-processing notice and requires an explicit user action to continue. The extension stores the accepted notice version and acceptance time locally so it can ask again if the notice materially changes.

## Audio processing

Audio capture begins only after the user starts enhancement for a normal HTTP or HTTPS tab. Chrome provides that tab's audio stream to an offscreen extension document, where the Web Audio API processes it locally.

ArSonKuPik does not upload, record, retain, sell, or share audio content. Audio is not used for analytics, advertising, profiling, model training, or any unrelated purpose.

## Information handled locally

ArSonKuPik may read the active or captured tab's URL and title to identify the tab selected by the user and to show the current source. It derives a normalized hostname, such as `example.com`, when saving a per-site preference.

The following data may be stored in Chrome extension storage in the current browser profile:

- Audio-engine settings, module values, and selected preset.
- Custom preset names and values.
- A normalized site hostname associated with an enhancement preference.
- The time a site preference was last updated.
- The accepted privacy-notice version and acceptance time.
- Active capture state needed to coordinate the service worker and offscreen audio document. Tab identifiers and source titles are cleared from active state when capture stops.

ArSonKuPik does not store full browsing history. It does not read or store page text, form contents, passwords, messages, cookies, or account credentials.

## Data minimization

Per-site records contain only the normalized hostname and the minimum preference data needed to restore the user's choice. ArSonKuPik does not store the page path, query string, tab title, or tab identifier in saved per-site preference records.

## Permissions

| Permission | Purpose |
|---|---|
| `activeTab` | Limits user-triggered access to the tab the user currently selects. |
| `tabCapture` | Obtains audio from the tab the user explicitly chooses to enhance. |
| `offscreen` | Keeps the local Web Audio processing graph alive after the popup closes. |
| `storage` | Saves settings, custom presets, consent, and per-site enhancement preferences locally. |

ArSonKuPik declares no host permissions and does not request microphone permission. Playback always uses the browser's system-default audio output; no speaker identifier is stored.

## Network access and third parties

The extension runtime contains no remote application code, analytics SDK, advertising SDK, telemetry endpoint, cloud synchronization, account system, or ArSonKuPik web-service request. Links opened by the user are normal browser navigation and are subject to the destination's own policies.

## Optional development support

ArSonKuPik can open an optional public support page after the user explicitly selects **Support ArSonKuPik**. The extension does not open the page automatically, does not send a user identifier, browsing activity, audio data, settings, or payment information, and does not determine whether a user contributes. The support page is currently designed for voluntary QRIS support in Indonesia. Any payment is handled outside the extension by the user's chosen banking or e-wallet application. Core features remain available regardless of support.

## Retention and deletion

Local configuration remains in the current Chrome profile until the user changes or deletes it. The popup provides two controls:

- **Clear Site Preferences** removes saved per-site enhancement preferences while keeping custom presets and general settings.
- **Reset All Local Data** stops capture and removes settings, custom presets, site preferences and privacy consent.

Uninstalling the extension also removes Chrome-managed extension data according to browser behavior.

## Chrome Web Store Limited Use

Use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements. Data is used only to provide and improve the user-facing audio-enhancement functionality described in the extension listing.

## Children

ArSonKuPik is a general-purpose audio utility and does not knowingly collect information from children or any other user.

## Changes

Material changes will be documented in the repository and reflected by an updated effective date or privacy-notice version. A materially changed notice can require renewed consent before audio enhancement starts.

## Contact

Use the repository's private security-reporting channel for privacy or security concerns. Do not include sensitive personal or account information in a public issue.


## Voluntary support reminder

The popup may store the timestamp of the first successful Enhance session, the next reminder date, and a local “I’ve supported” dismissal flag in `chrome.storage.local`. These values never leave the browser profile. ArSonKuPik does not verify payments, receive transaction status, or change feature access based on support.
