import { createLatestPatchQueue } from './latest-patch-queue.js';

const DEFAULT_MESSAGE_TIMEOUT_MS = 12000;

export function sendMessage(message, { timeoutMs = DEFAULT_MESSAGE_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      callback(value);
    };
    const timeoutId = setTimeout(() => {
      const command = message?.type ? ` ${message.type}` : '';
      finish(reject, new Error(`Extension service worker did not respond to${command}. Reload the extension and try again.`));
    }, Math.max(500, Number(timeoutMs) || DEFAULT_MESSAGE_TIMEOUT_MS));

    try {
      chrome.runtime.sendMessage(message, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          finish(reject, new Error(lastError.message));
          return;
        }
        finish(resolve, response);
      });
    } catch (error) {
      finish(reject, error);
    }
  });
}

function assertOk(response, fallbackMessage = 'Extension command failed.') {
  if (!response?.ok) {
    throw new Error(response?.error || fallbackMessage);
  }
  return response;
}

const enqueueEngineStatePatch = createLatestPatchQueue(async (patch) => {
  return assertOk(await sendMessage({ target: 'background', type: 'UPDATE_STATE', patch }), 'Unable to update audio engine.');
});

export function flushEngineStateUpdates() {
  return enqueueEngineStatePatch.flush();
}

export async function getEngineState() {
  await flushEngineStateUpdates();
  const response = await sendMessage({ target: 'background', type: 'GET_STATE' }, { timeoutMs: 4000 });
  return assertOk(response, 'Unable to read extension state.').state;
}

export async function startEnhance(sourceTabId = null) {
  await flushEngineStateUpdates();
  const message = { target: 'background', type: 'START_ENHANCE' };
  const tabId = Number(sourceTabId);
  if (Number.isInteger(tabId) && tabId > 0) message.sourceTabId = tabId;
  return assertOk(await sendMessage(message), 'Unable to start audio enhancement.');
}

export async function stopEnhance() {
  await flushEngineStateUpdates();
  return assertOk(await sendMessage({ target: 'background', type: 'STOP_ENHANCE' }), 'Unable to stop audio enhancement.');
}

export async function applyPreset(preset) {
  await flushEngineStateUpdates();
  return assertOk(await sendMessage({ target: 'background', type: 'APPLY_PRESET', presetId: preset?.id, preset }), 'Unable to apply preset.');
}

export function updateEngineState(patch) {
  return enqueueEngineStatePatch(patch);
}

export async function saveCustomPreset(preset) {
  await flushEngineStateUpdates();
  return assertOk(await sendMessage({ target: 'background', type: 'SAVE_CUSTOM_PRESET', preset }), 'Unable to save preset.');
}

export async function getPrivacyStatus() {
  const response = assertOk(await sendMessage({ target: 'background', type: 'GET_PRIVACY_STATUS' }), 'Unable to read privacy status.');
  return response.privacy;
}

export async function acceptPrivacyNotice() {
  return assertOk(await sendMessage({ target: 'background', type: 'ACCEPT_PRIVACY_NOTICE' }), 'Unable to save privacy consent.');
}

export async function clearSitePreferences() {
  await flushEngineStateUpdates();
  return assertOk(await sendMessage({ target: 'background', type: 'CLEAR_SITE_PREFERENCES' }), 'Unable to clear site preferences.');
}

export async function resetAllLocalData() {
  await flushEngineStateUpdates();
  return assertOk(await sendMessage({ target: 'background', type: 'RESET_ALL_LOCAL_DATA' }), 'Unable to reset local data.');
}

export async function openPrivacyPolicy() {
  return assertOk(await sendMessage({ target: 'background', type: 'OPEN_PRIVACY_POLICY' }), 'Unable to open the privacy policy.');
}

export async function openSupportPage() {
  return assertOk(await sendMessage({ target: 'background', type: 'OPEN_SUPPORT_PAGE' }), 'Unable to open the support page.');
}
