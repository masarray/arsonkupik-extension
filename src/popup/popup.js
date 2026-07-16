import { FACTORY_PRESETS, PRIMARY_MASTER_PRESET_IDS } from '../shared/presets.js';
import { getEngineState, startEnhance, stopEnhance, applyPreset, updateEngineState, sendMessage, acceptPrivacyNotice, clearSitePreferences, resetAllLocalData, openPrivacyPolicy, openSupportPage } from '../shared/messaging.js';

const ui = {
  statusDot: document.getElementById('statusDot'),
  sourceStatePill: document.getElementById('sourceStatePill'),
  sourceTitle: document.getElementById('sourceTitle'),
  startStopButton: document.getElementById('startStopButton'),
  hintText: document.getElementById('hintText'),
  soundModeToast: document.getElementById('soundModeToast'),
  soundModeToastStatus: document.getElementById('soundModeToastStatus'),
  presetSelect: document.getElementById('presetSelect'),
  outputGain: document.getElementById('outputGain'),
  outputGainValue: document.getElementById('outputGainValue'),
  limiterToggle: document.getElementById('limiterToggle'),
  privacyNotice: document.getElementById('privacyNotice'),
  acceptPrivacyButton: document.getElementById('acceptPrivacyButton'),
  privacyPolicyNoticeButton: document.getElementById('privacyPolicyNoticeButton'),
  privacyPolicyDataButton: document.getElementById('privacyPolicyDataButton'),
  clearSitePreferencesButton: document.getElementById('clearSitePreferencesButton'),
  resetAllLocalDataButton: document.getElementById('resetAllLocalDataButton'),
  localDataSummary: document.getElementById('localDataSummary'),
  openStudioButton: document.getElementById('openStudioButton'),
  supportDevelopmentButton: document.getElementById('supportDevelopmentButton')
};

let state = null;
let presets = [...FACTORY_PRESETS];
let busy = false;
let soundModeToastTimer = 0;
const MASARI_PRESET_LABEL = 'MasAri';

const FAVICON_STATE_PATHS = {
  active: { png: 'icons/icon-32.png', ico: 'icons/favicon.ico' },
  inactive: { png: 'icons/icon-32.png', ico: 'icons/favicon.ico' }
};

function updatePageFavicon(active) {
  const entry = active ? FAVICON_STATE_PATHS.active : FAVICON_STATE_PATHS.inactive;
  let icon = document.getElementById('arDynamicFavicon') || document.querySelector('link[rel~="icon"]');
  if (icon) icon.href = entry.png;
  const shortcut = document.querySelector('link[rel="shortcut icon"]');
  if (shortcut) shortcut.href = entry.ico;
}

init();

async function init() {
  bindEvents();
  await refreshState();
}

function bindEvents() {
  ui.startStopButton.addEventListener('click', async (event) => {
    if (!state?.privacy?.accepted) {
      revealPrivacyNotice();
      setHint('Accept the local-processing privacy notice before starting audio enhancement.');
      return;
    }
    if (busy) return;
    busy = true;
    const fullStop = Boolean(event.shiftKey || event.altKey);
    setHint(shouldStartOrSwitchToCurrentTab()
      ? 'Moving capture to this active tab…'
      : state?.active
        ? (fullStop ? 'Releasing tab capture…' : 'Switching enhance power without reopening YouTube audio…')
        : 'Starting capture for this tab…');
    try {
      const shouldAttachThisTab = shouldStartOrSwitchToCurrentTab();
      const toastMode = shouldAttachThisTab
        ? 'active'
        : state?.active
          ? (fullStop ? 'disable' : (state?.output?.bypass ? 'active' : 'disable'))
          : 'active';
      const response = shouldAttachThisTab
        ? await startEnhanceWithAutoBypassOff(state?.currentTabId)
        : state?.active
          ? (fullStop ? await stopEnhance() : await toggleEnhanceBypass())
          : await startEnhanceWithAutoBypassOff(state?.currentTabId);
      if (!response?.ok) throw new Error(response?.error || 'Command failed');
      await refreshState();
      showSoundModeToast(toastMode);
    } catch (error) {
      setHint(error.message);
    } finally {
      busy = false;
    }
  });

  ui.outputGain.addEventListener('input', async () => {
    const outputGain = Number(ui.outputGain.value);
    ui.outputGainValue.textContent = `${outputGain.toFixed(1)} dB`;
    state = { ...state, output: { ...state.output, outputGain } };
    await updateEngineState({ output: { outputGain } }).catch((error) => setHint(error.message));
  });

  ui.limiterToggle.addEventListener('change', async () => {
    const limiterEnabled = ui.limiterToggle.checked;
    state = { ...state, output: { ...state.output, limiterEnabled } };
    await updateEngineState({ output: { limiterEnabled } }).catch((error) => setHint(error.message));
  });


  ui.presetSelect.addEventListener('change', async () => {
    const preset = presets.find((candidate) => candidate.id === ui.presetSelect.value);
    if (!preset) return;
    await applyPreset(preset).catch((error) => setHint(error.message));
    await refreshState();
  });

  ui.acceptPrivacyButton?.addEventListener('click', async () => {
    ui.acceptPrivacyButton.disabled = true;
    try {
      const response = await acceptPrivacyNotice();
      if (response.state) state = response.state;
      await refreshState();
      setHint('Privacy notice accepted. Audio remains local to this device.');
    } catch (error) {
      setHint(error.message || 'Unable to save privacy consent.');
    } finally {
      ui.acceptPrivacyButton.disabled = false;
    }
  });

  for (const button of [ui.privacyPolicyNoticeButton, ui.privacyPolicyDataButton]) {
    button?.addEventListener('click', () => openPrivacyPolicy().catch((error) => setHint(error.message)));
  }

  ui.supportDevelopmentButton?.addEventListener('click', () => {
    openSupportPage().catch((error) => setHint(error.message));
  });

  ui.clearSitePreferencesButton?.addEventListener('click', async () => {
    if (!window.confirm('Clear all saved per-site enhancement preferences? Custom presets will be kept.')) return;
    try {
      const response = await clearSitePreferences();
      if (response.state) state = response.state;
      await refreshState();
      setHint('Saved site preferences cleared. Custom presets were kept.');
    } catch (error) {
      setHint(error.message || 'Unable to clear site preferences.');
    }
  });

  ui.resetAllLocalDataButton?.addEventListener('click', async () => {
    if (!window.confirm('Reset all ArSonKuPik local data? This removes custom presets, settings, site preferences, and privacy consent.')) return;
    try {
      const response = await resetAllLocalData();
      if (response.state) state = response.state;
      await refreshState();
      setHint('All local data was reset. Review the privacy notice before using audio enhancement again.');
    } catch (error) {
      setHint(error.message || 'Unable to reset local data.');
    }
  });

  ui.openStudioButton.addEventListener('click', () => {
    sendMessage({ target: 'background', type: 'OPEN_STUDIO' }).catch((error) => setHint(error.message));
  });
}

async function refreshState() {
  const next = await getEngineState().catch((error) => {
    setHint(error.message);
    return null;
  });
  if (!next) return;
  state = next;
  presets = next.presets || FACTORY_PRESETS;
  render();
}


async function startEnhanceWithAutoBypassOff(sourceTabId = null) {
  if (state?.output?.bypass === true) {
    setHint('Reactivating mastering chain…');
    state = { ...state, output: { ...state.output, bypass: false } };
    await updateEngineState({ output: { bypass: false } });
  }
  return startEnhance(sourceTabId);
}

function shouldStartOrSwitchToCurrentTab() {
  if (!state?.currentTabId) return !state?.active;
  if (!state?.active) return true;
  return !Boolean(state?.isCurrentTabCapture);
}

async function toggleEnhanceBypass() {
  const bypass = !Boolean(state?.output?.bypass);
  state = { ...state, output: { ...state.output, bypass } };
  setHint(bypass
    ? 'Enhance off. Capture kept warm so YouTube does not renegotiate playback.'
    : 'Enhance on. Reusing the same capture stream.');
  return updateEngineState({ output: { bypass } });
}

function getPresetDisplayName(preset) {
  if (!preset) return MASARI_PRESET_LABEL;
  if (preset.id === 'default') return MASARI_PRESET_LABEL;
  return preset.name || MASARI_PRESET_LABEL;
}

function render() {
  renderPrivacyState();
  const isActive = Boolean(state.active);
  const isBypassed = Boolean(state.output?.bypass);
  const isCurrentTabCapture = Boolean(state.isCurrentTabCapture);
  const canAttachCurrentTab = Boolean(state.currentTabId && (!isActive || !isCurrentTabCapture));
  updatePageFavicon(isActive && !isBypassed && isCurrentTabCapture);
  ui.statusDot.classList.toggle('active', isActive && !isBypassed && isCurrentTabCapture);
  ui.statusDot.classList.toggle('warm', (isActive && isBypassed) || (isActive && !isCurrentTabCapture));
  if (ui.sourceStatePill) {
    const pillMode = !isActive ? 'idle' : ((isBypassed || !isCurrentTabCapture) ? 'warm' : 'active');
    ui.sourceStatePill.className = `source-state-pill ${pillMode}`;
    ui.sourceStatePill.textContent = !isActive ? 'Idle' : (canAttachCurrentTab ? 'Ready Here' : (isBypassed ? 'Bypass' : 'Active'));
  }
  ui.sourceTitle.textContent = isActive && !isCurrentTabCapture
    ? `Enhance active on another tab${state.captureDomain ? ` · ${state.captureDomain}` : ''}`
    : (state.sourceTitle || 'No active capture');
  ui.startStopButton.hidden = false;
  ui.startStopButton.disabled = !state?.privacy?.accepted;
  ui.startStopButton.textContent = canAttachCurrentTab ? 'Enhance This Tab' : (!isActive ? 'Start Enhance' : (isBypassed ? 'Enhance On' : 'Enhance Off'));
  ui.startStopButton.title = canAttachCurrentTab
    ? 'Attach ArSonKuPik to the current active tab and release the previous capture stream.'
    : isActive
      ? 'Click toggles mastering bypass without reopening capture. Shift-click releases tab capture fully.'
      : state?.privacy?.accepted
        ? 'Start local tab capture and audio enhancement.'
        : 'Accept the local-processing privacy notice before starting.';
  ui.startStopButton.classList.toggle('danger', isActive && !isBypassed && isCurrentTabCapture);
  const outputGain = Number(state.output?.outputGain ?? -1.6);
  ui.outputGain.value = outputGain;
  ui.outputGainValue.textContent = `${outputGain.toFixed(1)} dB`;
  ui.limiterToggle.checked = Boolean(state.output?.limiterEnabled);
  renderPresets();
  setHint(isActive && !isCurrentTabCapture
    ? `Enhance is attached to another tab${state.domainEnhanceEnabled && state.currentDomain ? `; ${state.currentDomain} is remembered. Click Enhance This Tab to move it here.` : '. Click Enhance This Tab to move it here.'}`
    : isActive
      ? (isBypassed ? 'Enhance is off but capture is kept warm to avoid YouTube buffering.' : 'Enhancing this tab locally.')
      : (state.domainEnhanceEnabled && state.currentDomain ? `Enhancer remembered for ${state.currentDomain}. Click Start Enhance to attach this tab.` : 'Audio is processed locally. No recording, no upload.'));
}

function renderPrivacyState() {
  const privacy = state?.privacy || {};
  const accepted = Boolean(privacy.accepted);
  if (ui.privacyNotice) ui.privacyNotice.hidden = accepted;
  const sites = Number(privacy.sitePreferenceCount || 0);
  const presetsCount = Number(privacy.customPresetCount || 0);
  if (ui.localDataSummary) {
    ui.localDataSummary.textContent = `${sites} site preference${sites === 1 ? '' : 's'} · ${presetsCount} custom preset${presetsCount === 1 ? '' : 's'} stored locally.`;
  }
  if (ui.clearSitePreferencesButton) ui.clearSitePreferencesButton.disabled = sites === 0;
}

function revealPrivacyNotice() {
  if (!ui.privacyNotice) return;
  ui.privacyNotice.hidden = false;
  ui.privacyNotice.scrollIntoView({ block: 'nearest' });
  ui.acceptPrivacyButton?.focus();
}

function renderPresets() {
  // Mirror the studio master preset list exactly (primary masters + custom), with
  // factory fallback so the native select never opens as an empty list.
  const source = Array.isArray(presets) && presets.length ? presets : FACTORY_PRESETS;
  const primary = source.filter((preset) => PRIMARY_MASTER_PRESET_IDS.includes(preset.id));
  const custom = source.filter((preset) => !FACTORY_PRESETS.some((factory) => factory.id === preset.id));
  const fallbackPrimary = FACTORY_PRESETS.filter((preset) => PRIMARY_MASTER_PRESET_IDS.includes(preset.id));
  const ordered = [...(primary.length ? primary : fallbackPrimary), ...custom].filter((preset, index, list) => (
    preset?.id && list.findIndex((candidate) => candidate.id === preset.id) === index
  ));
  const selectedId = state.selectedPresetId || 'default';
  const isKnown = ordered.some((preset) => preset.id === selectedId);
  const desired = ordered.map((preset) => preset.id).join('|') + `|${isKnown ? '' : 'custom'}`;
  if (ui.presetSelect.dataset.optionIds !== desired) {
    ui.presetSelect.innerHTML = '';
    if (!isKnown) {
      const customOpt = document.createElement('option');
      customOpt.value = '';
      customOpt.textContent = MASARI_PRESET_LABEL;
      ui.presetSelect.appendChild(customOpt);
    }
    for (const preset of ordered) {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = getPresetDisplayName(preset);
      option.title = preset.description || preset.name;
      ui.presetSelect.appendChild(option);
    }
    ui.presetSelect.dataset.optionIds = desired;
  }
  ui.presetSelect.value = isKnown ? selectedId : '';
}

function setHint(message) {
  ui.hintText.textContent = message;
}

function showSoundModeToast(mode) {
  if (!ui.soundModeToast || !ui.soundModeToastStatus) return;
  const isDisable = mode === 'disable';
  window.clearTimeout(soundModeToastTimer);
  ui.soundModeToastStatus.textContent = isDisable ? 'Disable' : 'Active';
  ui.soundModeToast.classList.toggle('disable', isDisable);
  ui.soundModeToast.classList.remove('show');
  ui.soundModeToast.hidden = false;
  // Force a reflow so repeated ON/OFF clicks replay the premium pop animation.
  void ui.soundModeToast.offsetWidth;
  ui.soundModeToast.classList.add('show');
  soundModeToastTimer = window.setTimeout(() => {
    ui.soundModeToast.classList.remove('show');
    window.setTimeout(() => {
      if (!ui.soundModeToast.classList.contains('show')) ui.soundModeToast.hidden = true;
    }, 180);
  }, 1700);
}

