#!/usr/bin/env python3
"""Correct and guard the legacy TURBO-to-STABLE migration revision."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
worker_path = ROOT / 'src/background/service-worker.js'
worker = worker_path.read_text(encoding='utf-8')
old = "stabilityRevision: Number(state.performance?.stabilityRevision || STABILITY_REVISION)"
new = "stabilityRevision: Number(state.performance?.stabilityRevision || 0)"
if old not in worker:
    if new not in worker:
        raise RuntimeError('Performance revision normalization anchor not found')
else:
    worker_path.write_text(worker.replace(old, new, 1), encoding='utf-8')

smoke_path = ROOT / 'scripts/smoke_stability.mjs'
smoke = smoke_path.read_text(encoding='utf-8')
anchor = "assert.match(worker, /STABILITY_REVISION/);\n"
assertion = "assert.match(worker, /stabilityRevision: Number\\(state\\.performance\\?\\.stabilityRevision \\|\\| 0\\)/);\n"
if assertion not in smoke:
    if anchor not in smoke:
        raise RuntimeError('Stability smoke-test anchor not found')
    smoke = smoke.replace(anchor, anchor + assertion, 1)
    smoke_path.write_text(smoke, encoding='utf-8')

print('Legacy performance migration revision guard applied.')
