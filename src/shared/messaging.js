import { createLatestPatchQueue } from './latest-patch-queue.js';

export function sendMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(error);
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
  const response = await sendMessage({ target: 'background', type: 'GET_STATE' });
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
