#!/usr/bin/env bash
set -euo pipefail

TARGET_BRANCH="agent/release-hardening-0.3.111"

if [[ ! -f .github/release-hardening.payload ]]; then
  echo "Release-hardening payload already consumed."
  exit 0
fi

python3 - <<'PY'
import base64
import gzip
from pathlib import Path

payload = ''.join(Path('.github/release-hardening.payload').read_text(encoding='utf-8').split())
payload += '=' * (-len(payload) % 4)
compressed = base64.b64decode(payload, validate=False)
Path('/tmp/release-hardening.py').write_bytes(gzip.decompress(compressed))
PY

python3 /tmp/release-hardening.py

python3 - <<'PY'
from pathlib import Path

metadata_path = Path('scripts/check_release_metadata.mjs')
metadata = metadata_path.read_text(encoding='utf-8')
old_assertion = r'''assert.match(privacyDisclosure, /### Website content[\s\S]*?\*\*Declare handling:\*\* No\./);'''
new_assertion = r'''assert.match(privacyDisclosure, /### Website content[\s\S]*?\*\*Declare handling: Yes\.\*\*/);'''
if old_assertion not in metadata:
    raise SystemExit('Expected legacy Website content assertion was not found')
metadata_path.write_text(metadata.replace(old_assertion, new_assertion, 1), encoding='utf-8')

disclosure_path = Path('CHROME_WEB_STORE_PRIVACY_DISCLOSURE.md')
disclosure = disclosure_path.read_text(encoding='utf-8')
old_check = 'Confirm the listing does not mention output-device routing.'
new_check = 'Confirm the listing does not mention output-device routing or stored output routes.'
if old_check not in disclosure:
    raise SystemExit('Expected output-routing checklist wording was not found')
disclosure_path.write_text(disclosure.replace(old_check, new_check, 1), encoding='utf-8')
PY

run_check() {
  local name="$1"
  shift
  if "$@" > /tmp/release-single-check.log 2>&1; then
    echo "PASS ${name}"
  else
    echo "FAIL ${name}"
    tail -n 35 /tmp/release-single-check.log
    exit 1
  fi
}

run_check repository_identity node scripts/check_repository_identity.mjs
run_check release_metadata node scripts/check_release_metadata.mjs
run_check repository_validator node scripts/run-python.mjs scripts/validate.py
run_check privacy node scripts/smoke_privacy.mjs
run_check support_page node scripts/smoke_support.mjs
run_check audio_stability node scripts/smoke_stability.mjs
run_check headless_audio node scripts/smoke_headless.mjs
run_check update_queue node scripts/smoke_update_queue.mjs
run_check global_state_queue node scripts/smoke_global_state_queue.mjs
run_check runtime_startup node scripts/smoke_runtime_startup.mjs
run_check audio_route node scripts/smoke_audio_route.mjs
run_check manual_support node scripts/smoke_support_prompt.mjs
run_check signature_presets node scripts/smoke_signature_presets.mjs
run_check localization node scripts/smoke_i18n.mjs
run_check release_check npm run release:check
run_check webstore_package npm run package

rm -f .github/release-hardening.payload
rm -f .github/workflows/apply-release-hardening-once.yml
rm -f .github/run-release-hardening.sh

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
if ! git diff --cached --quiet; then
  git commit -m "Harden Chrome Web Store release 0.3.111"
  git push -q origin HEAD:"${TARGET_BRANCH}"
fi
