#!/usr/bin/env python3
from pathlib import Path

root = Path.cwd()
worker_path = root / 'src/background/service-worker.js'
worker = worker_path.read_text(encoding='utf-8')
old = """chrome.runtime.onMessage.addListener((message) => {
  if (message?.target === 'background-state' && message.type === 'STATE_CHANGED') {
    stateCommandScheduler.enqueueCommand(() => applyOffscreenStateChanged(message.state || {})).catch(() => {});
  }
  return false;
});
"""
new = """chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'background-state' || message.type !== 'STATE_CHANGED') {
    return false;
  }

  stateCommandScheduler.enqueueCommand(() => applyOffscreenStateChanged(message.state || {}))
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});
"""
if worker.count(old) != 1:
    raise RuntimeError('STATE_CHANGED listener source changed')
worker_path.write_text(worker.replace(old, new, 1), encoding='utf-8')

validator_path = root / 'scripts/check_release_metadata.mjs'
validator = validator_path.read_text(encoding='utf-8')
needle = "assert.match(worker, /stateCommandScheduler\\.enqueuePatch/);\n"
addition = needle + "assert.match(worker, /background-state[\\s\\S]*sendResponse[\\s\\S]*return true;/, 'STATE_CHANGED listener must keep the service worker alive until persistence completes');\n"
if validator.count(needle) != 1:
    raise RuntimeError('validator scheduler assertion changed')
validator_path.write_text(validator.replace(needle, addition, 1), encoding='utf-8')

print('Repaired STATE_CHANGED service-worker lifetime handling.')
