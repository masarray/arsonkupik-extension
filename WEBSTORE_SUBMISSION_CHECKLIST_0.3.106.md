# Chrome Web Store Submission Checklist — v0.3.106

## Upload artifact

Upload only:

`ArSonKuPik-v0.3.106-chrome-web-store-CI-validated.zip`

Expected runtime ZIP SHA-256:

`ec2c7f682bf2000bbec9970d4bc9480c19cb888e9520b1c78b138d0e658a6f0a`

Expected properties:

- Manifest version: `3`
- Extension version: `0.3.106`
- Runtime files: `26`
- Permissions: `activeTab`, `tabCapture`, `offscreen`, `storage`
- Host permissions: none
- QRIS/support-page assets in ZIP: none
- Remote runtime code, analytics, telemetry, ads, microphone access, and cloud audio upload: none

Do not upload a repository archive, GitHub Actions outer artifact, source ZIP, or an older v0.3.105 package.

## Store listing

Use `CHROME_WEB_STORE_LISTING.md` as the source of truth.

- Do not mention output-device routing or saved output routes.
- Describe playback as direct system-default playback.
- Keep the single purpose focused on local, user-initiated browser-tab audio enhancement.
- The voluntary support link may be mentioned only as optional, user-initiated, and unrelated to feature access.

## Privacy practices

Use `CHROME_WEB_STORE_PRIVACY_DISCLOSURE.md` as the source of truth.

- Website content: **No**
- Browsing activity / web history: **Yes, limited** to the selected tab hostname used for optional local per-site preferences
- Audio: processed transiently and locally; not recorded, retained, uploaded, sold, or shared
- Personally identifiable, authentication, financial, health, location, and personal-communication data: **No**
- Permitted purposes: app functionality and user customization only
- No advertising, analytics, profiling, lending, or creditworthiness use

## Public URLs

Verify these load publicly before submitting:

- Website: `https://masarray.github.io/arsonkupik-extension/`
- Privacy policy: `https://masarray.github.io/arsonkupik-extension/privacy.html`
- Technical support: `https://masarray.github.io/arsonkupik-extension/support.html`
- Voluntary support: `https://masarray.github.io/arsonkupik-extension/id/dukung.html`

The QRIS page must:

- show merchant `SONKUPIK, AUDIO DEVELOPER, DIGITAL & KREATIF`;
- show NMID `ID1026551401775`;
- remain voluntary and independent of extension functionality;
- contain no analytics, payment SDK, transaction lookup, or extension/tab data;
- display a QR that scans to the independently verified merchant destination.

## Manual Chrome verification

Before clicking **Submit for review**:

1. Install the exact ZIP in a clean Chrome profile.
2. Confirm first-use consent blocks capture until accepted.
3. Start and stop enhancement on audible tabs.
4. Open and close Studio repeatedly.
5. Drag EQ, dynamics, color, width, and output controls rapidly.
6. Apply presets while audio is active.
7. Confirm playback continues after popup and Studio close.
8. Run at least 30–60 minutes of continuous playback.
9. Confirm Clear Site Preferences and Reset All Local Data behave as disclosed.
10. Open the support link and scan QRIS using at least two banking/e-wallet applications.

## Final submission record

Record in the release notes or internal submission log:

- uploaded filename;
- SHA-256;
- Chrome Web Store dashboard submission time;
- tester and Chrome version;
- privacy-policy URL verification;
- QRIS scan applications used;
- any review feedback received.
