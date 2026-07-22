from pathlib import Path

OLD = "0.3.111"
NEW = "0.3.112"

for relative in ("docs/index.html", "docs/id/index.html"):
    path = Path(relative)
    text = path.read_text(encoding="utf-8")
    if OLD not in text:
        raise SystemExit(f"Expected {OLD} in {relative}")
    path.write_text(text.replace(OLD, NEW), encoding="utf-8")

readme = Path("README.md")
text = readme.read_text(encoding="utf-8")
if NEW not in text:
    anchor = "> Audio stays inside the browser. The extension has no host permissions, analytics, telemetry, account system, or cloud audio upload."
    if anchor not in text:
        raise SystemExit("README release insertion anchor not found")
    text = text.replace(anchor, f"{anchor}\n\n**Current stable release: {NEW}.**", 1)
readme.write_text(text, encoding="utf-8")

print("Synchronized README and bilingual landing pages to 0.3.112.")
