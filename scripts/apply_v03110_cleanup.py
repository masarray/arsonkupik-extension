#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
replacements = {
    "src/shared/presets.js": {
        "MasAri Sparkle Balance": "Mas Ari Signature Sparkle Balance",
        "MasAri Glow": "Mas Ari Signature Glow",
    },
    "src/studio/studio.js": {
        "const MASARI_PRESET_LABEL = 'MasAri';": "const MASARI_PRESET_LABEL = 'Mas Ari Signature';",
    },
    "studio.html": {
        "Reset to MasAri preset": "Reset to Mas Ari Signature preset",
    },
}

for relative, mapping in replacements.items():
    path = ROOT / relative
    text = path.read_text(encoding="utf-8")
    for old, new in mapping.items():
        if old not in text:
            raise RuntimeError(f"Missing {old!r} in {relative}")
        text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")

smoke = ROOT / "scripts/smoke_signature_presets.mjs"
text = smoke.read_text(encoding="utf-8")
needle = "assert.equal(flagship?.name, 'Mas Ari Signature');\n"
addition = """assert.equal(flagship?.name, 'Mas Ari Signature');
for (const runtimeFile of ['popup.html', 'studio.html', 'src/popup/popup.js', 'src/studio/studio.js', 'src/shared/presets.js']) {
  assert.doesNotMatch(read(runtimeFile), /MasAri/, `${runtimeFile} still contains the legacy MasAri label`);
}
"""
if text.count(needle) != 1:
    raise RuntimeError("Unable to extend signature naming regression")
smoke.write_text(text.replace(needle, addition, 1), encoding="utf-8")

(ROOT / "scripts/apply_v03110_cleanup.py").unlink()
print("Completed Mas Ari Signature naming cleanup")
