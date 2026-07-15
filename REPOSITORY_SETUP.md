# GitHub Repository Setup

Recommended repository name: **ArSonKuPik**

Recommended description:

> Privacy-first professional browser audio enhancer with parametric EQ, dynamics, harmonics, stereo width, limiting, and output routing.

Recommended topics:

```text
audio-enhancer chrome-extension browser-extension web-audio-api equalizer
parametric-eq audio-mastering manifest-v3 stereo-width compressor limiter
```

## Initial publish

```bash
git init
git add .
git commit -m "chore: publish ArSonKuPik 0.3.102"
git branch -M main
git remote add origin https://github.com/masarray/arsonkupik-extension.git
git push -u origin main
```

## GitHub settings

1. Set the default branch to `main`.
2. Enable **Issues**, **Discussions**, and **Private vulnerability reporting**.
3. Under **Pages**, select **GitHub Actions** as the source.
4. Add branch protection for `main`: require the `Validate repository` check and disallow force pushes.
5. Create release `v0.3.102`; the release workflow will attach the clean Web Store ZIP.
6. Add the website URL `https://masarray.github.io/arsonkupik-extension/` to the repository profile.

## Chrome Web Store fields

- Website: `https://masarray.github.io/arsonkupik-extension/`
- Support: `https://masarray.github.io/arsonkupik-extension/support.html`
- Privacy policy: `https://masarray.github.io/arsonkupik-extension/privacy.html`
- Category: Productivity or Accessibility, depending on final store positioning.

Review every permission justification against the exact submitted build before publication.
