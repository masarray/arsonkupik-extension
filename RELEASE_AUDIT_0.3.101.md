# ArSonKuPik 0.3.101 P0 Release Audit

**Audit date:** July 15, 2026  
**Scope:** Chrome Web Store permission, privacy, asset, and contributor-rights blockers identified after the 0.3.100 repository audit

## Outcome

All four P0 findings are addressed in the 0.3.101 source and release package.

| P0 finding | Resolution | Verification |
|---|---|---|
| Broad `contentSettings` permission | Removed from the manifest and runtime. Named speaker selection uses `selectAudioOutput()` only after a direct user gesture; unsupported browsers remain on System Default. | Validator rejects the permission and any `chrome.contentSettings` runtime reference. |
| Incomplete local-data disclosure and deletion | Added a versioned first-use notice, service-worker consent gate, normalized-hostname data minimization, separate site-preference deletion, total local-data reset, and Limited Use statement. | Privacy smoke test verifies blocked start before consent, upgrade shutdown, no tab query before consent, site deletion, and consent revocation after reset. |
| Product poster / sponsorship and asset-rights risk | Removed the product-specific SC220 MKII poster and bundled product photography. Replaced it with an independent, generic hardware guide carrying an explicit non-sponsored and no-affiliate disclosure. | Runtime scan rejects the removed asset/name; attribution, third-party notice, and trademark files are present. |
| Unclear inbound contribution rights | Added a Contributor License Agreement with copyright and patent grants and an explicit pull-request acceptance checkbox. | Release validator checks that the CLA and PR acknowledgement are present. |

## Data-minimization changes

Saved per-site preference records now contain only:

- Normalized hostname.
- Enhancement enabled state or selected output route.
- Update timestamp.

Saved per-site records no longer contain tab titles, page paths, query strings, or tab identifiers.

## Permission set

The 0.3.101 manifest requests only:

- `activeTab`
- `tabCapture`
- `offscreen`
- `storage`

It declares no host permissions and no microphone permission.

## Required release commands

```bash
npm run release:check
npm run package
```

A release is not approved if either command fails or if the generated ZIP differs from the reviewed runtime file set.

## Manual Chrome verification still required

Automated checks do not replace final browser testing. Before Chrome Web Store submission, use a new Chrome profile to verify:

1. The first-use notice is visible and Start Enhance is disabled before acceptance.
2. Accept & Continue enables tab capture.
3. Output routing uses the browser chooser when available and System Default otherwise.
4. Clear Site Preferences keeps custom presets.
5. Reset All Local Data removes settings, presets, routes, and consent.
6. The public privacy-policy URL is live and matches this release.
