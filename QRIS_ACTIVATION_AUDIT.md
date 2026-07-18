# Official QRIS Activation Audit

- Source: provider-issued static merchant QRIS sheet supplied by the maintainer.
- Source dimensions: `1090 × 1536` pixels.
- Source JPEG SHA-256: `0095ddce62265f7a42795bb75a1077267a0873da75c84b745e23712cf53c4a11`.
- Display merchant: `SONKUPIK, AUDIO DEVELOPER, DIGITAL & KREATIF`.
- NMID: `ID1026551401775`.
- Merchant city decoded from the QR payload: `BOGOR`.
- Verified EMV payload ends with CRC `F498`.
- Web image: an `810 × 810` crop taken directly from the official sheet with the full QR quiet zone preserved, converted to grayscale and binarized with Otsu thresholding for reliable browser display.
- Web PNG SHA-256: `832e363510443475bdc45062a2fd3156516957d0ac118f846c02ffe71bbbe0c6`.
- The QR was not reconstructed from text or regenerated from the payload. No module geometry was manually redrawn, stretched, overlaid, or recolored.
- Both the provider image and the final web PNG were independently decoded and returned the same merchant payload before activation.
- The web PNG is embedded as a local `data:image/png;base64` resource in `docs/support-config.js`; it makes no network request.
- Support remains voluntary and does not unlock, restrict, or alter extension functionality.
- The support configuration and QR image are hosted only by GitHub Pages and are excluded from the Chrome extension runtime ZIP.
