import { createDefaultState, FACTORY_PRESETS, DEFAULT_MASTER_REVISION, applyPresetToState, normalizeEqBands, normalizeCompressor, normalizeColor, normalizeWidth, normalizeOutput } from '../shared/presets.js';
import { DEFAULT_PERFORMANCE_MODE, STABILITY_REVISION, normalizePerformanceMode } from '../shared/audio-stability.js';

const OFFSCREEN_URL = 'offscreen.html';
const STORE_KEYS = {
  state: 'arAudioState',
  customPresets: 'arAudioCustomPresets',
  domainEnhancePrefs: 'arAudioDomainEnhancePrefs',
  privacyConsent: 'arAudioPrivacyConsent',
  studioTabId: 'arAudioStudioTabId'
};

const PRIVACY_NOTICE_VERSION = '2026-07-15-p0';
const PRIVACY_POLICY_URL = 'https://masarray.github.io/arsonkupik-extension/privacy.html';
const SUPPORT_DEVELOPMENT_URL = 'https://masarray.github.io/arsonkupik-extension/id/dukung.html';

let lastState = createDefaultState();
let creatingOffscreenDocument = null;
let studioTabId = null;
let openingStudioPromise = null;

const CLASSIC_ACTION_ICON_PATHS = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png'
};

function createSilentMeters() {
  return {
    inputPeak: 0,
    outputPeak: 0,
    gainReduction: 0,
    compressorGainReduction: 0,
    compressorGainReductionLeft: 0,
    compressorGainReductionRight: 0,
    limiterGainReduction: 0,
    inputPeakLeft: 0,
    inputPeakRight: 0,
    outputPeakLeft: 0,
    outputPeakRight: 0,
    correlation: 1,
    clipping: false
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isEnhancerAudiblyActive(state = lastState) {
  return Boolean(state?.active && state?.output?.bypass !== true);
}

async function updateActionVisual(state = lastState) {
  if (!chrome.action) return;
  const audible = isEnhancerAudiblyActive(state);
  const icon = CLASSIC_ACTION_ICON_PATHS;
  const captureTabId = Number(state?.tabId);
  const privacyAccepted = (await getPrivacyStatus()).accepted;
  const activeTab = privacyAccepted ? await getActiveWebTab().catch(() => null) : null;
  const activeTabId = Number(activeTab?.id);
  const hasCaptureTab = Number.isInteger(captureTabId) && captureTabId > 0;
  const hasActiveTab = Number.isInteger(activeTabId) && activeTabId > 0;
  const activeThisTab = Boolean(audible && hasCaptureTab && hasActiveTab && activeTabId === captureTabId);
  const globalTitle = audible
    ? 'ArSonKuPik — Active on captured tab'
    : 'ArSonKuPik — Sound Enhancer Off';
  const activeTitle = activeThisTab
    ? 'ArSonKuPik — Sound Enhancer Active on this tab'
    : audible
      ? 'ArSonKuPik — Off on this tab; active on another tab'
      : 'ArSonKuPik — Sound Enhancer Off';

  await chrome.action.setIcon({ path: icon }).catch(() => {});
  await chrome.action.setTitle({ title: globalTitle }).catch(() => {});

  if (chrome.action.setBadgeText) {
    // Keep the global badge OFF so ON never leaks to unrelated tabs. Then mark
    // only the captured tab as ON and the currently active tab according to its
    // own enhancement state.
    await chrome.action.setBadgeText({ text: 'OFF' }).catch(() => {});
    if (hasCaptureTab) {
      await chrome.action.setBadgeText({ tabId: captureTabId, text: audible ? 'ON' : 'OFF' }).catch(() => {});
    }
    if (hasActiveTab) {
      await chrome.action.setBadgeText({ tabId: activeTabId, text: activeThisTab ? 'ON' : 'OFF' }).catch(() => {});
    }
  }
  if (chrome.action.setBadgeBackgroundColor) {
    await chrome.action.setBadgeBackgroundColor({ color: audible ? '#7c3aed' : '#ef4444' }).catch(() => {});
    if (hasCaptureTab) {
      await chrome.action.setBadgeBackgroundColor({ tabId: captureTabId, color: audible ? '#7c3aed' : '#ef4444' }).catch(() => {});
    }
    if (hasActiveTab) {
      await chrome.action.setBadgeBackgroundColor({ tabId: activeTabId, color: activeThisTab ? '#7c3aed' : '#ef4444' }).catch(() => {});
    }
  }
  if (hasActiveTab) {
    await chrome.action.setTitle({ tabId: activeTabId, title: activeTitle }).catch(() => {});
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureStorageDefaults();
  await updateActionVisual(lastState);
});

chrome.runtime.onStartup?.addListener(async () => {
  await ensureStorageDefaults();
  await updateActionVisual(lastState);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== 'background') {
    return false;
  }

  handleBackgroundMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.target === 'background-state' && message.type === 'STATE_CHANGED') {
    lastState = prepareStateForStorage({ ...lastState, ...message.state });
    chrome.storage.local.set({ [STORE_KEYS.state]: lastState });
    updateActionVisual(lastState).catch(() => {});
  }
  return false;
});

chrome.tabCapture?.onStatusChanged?.addListener((info) => {
  if (info.status === 'stopped' || info.status === 'error') {
    safeSendMessage({ target: 'offscreen', type: 'CAPTURE_STOPPED', tabId: info.tabId });
    markCaptureInactiveIfMatches(info.tabId).catch(() => {});
  }
});

chrome.tabs?.onRemoved?.addListener((tabId) => {
  if (Number(tabId) === Number(studioTabId)) {
    studioTabId = null;
    safeSendMessage({ target: 'offscreen', type: 'SET_MONITORING_ACTIVE', active: false });
    clearStoredStudioTabId().catch(() => {});
  }
  markCaptureInactiveIfMatches(tabId).catch(() => {});
});

chrome.tabs?.onActivated?.addListener(() => {
  updateActionVisual(lastState).catch(() => {});
});

chrome.tabs?.onUpdated?.addListener((tabId, changeInfo) => {
  const isCaptureTab = Number(tabId) === Number(lastState?.tabId);
  if (isCaptureTab || changeInfo?.status === 'complete' || changeInfo?.url) {
    updateActionVisual(lastState).catch(() => {});
  }
});

chrome.windows?.onFocusChanged?.addListener(() => {
  updateActionVisual(lastState).catch(() => {});
});


function shouldRefreshFactoryDefaultMaster(state) {
  return (state?.selectedPresetId || 'default') === 'default' && state?.defaultMasterRevision !== DEFAULT_MASTER_REVISION;
}


function detectInitialPerformanceMode() {
  const nav = globalThis.navigator || {};
  const cores = Number(nav.hardwareConcurrency || 0);
  const memory = Number(nav.deviceMemory || 0);
  const hasCoreHint = Number.isFinite(cores) && cores > 0;
  const hasMemoryHint = Number.isFinite(memory) && memory > 0;
  const veryLowCore = hasCoreHint && cores <= 2;
  const lowCore = hasCoreHint && cores <= 4;
  const lowMemory = hasMemoryHint && memory <= 4;
  const tinyMemory = hasMemoryHint && memory <= 2;
  const eco = Boolean(veryLowCore || tinyMemory || (lowCore && lowMemory));
  return {
    mode: eco ? 'eco' : 'stable',
    autoSelected: true,
    userSelected: false,
    source: 'initial-stability-hint',
    stabilityRevision: STABILITY_REVISION,
    hardwareConcurrency: hasCoreHint ? cores : null,
    deviceMemory: hasMemoryHint ? memory : null,
    reason: eco ? 'low-power hardware hint' : 'stable playback default',
    selectedAt: Date.now()
  };
}

function applyInitialPerformanceMode(state) {
  const hint = detectInitialPerformanceMode();
  return {
    ...state,
    performance: hint
  };
}

function migratePerformanceForStability(state) {
  const performance = { ...(state.performance || {}) };
  const mode = normalizePerformanceMode(performance.mode || DEFAULT_PERFORMANCE_MODE);
  const revision = Number(performance.stabilityRevision || 0);
  const migrateAutoTurbo = revision < STABILITY_REVISION && mode === 'normal' && performance.userSelected !== true;
  return {
    ...state,
    performance: {
      ...performance,
      mode: migrateAutoTurbo ? 'stable' : mode,
      autoSelected: migrateAutoTurbo ? true : Boolean(performance.autoSelected),
      userSelected: performance.userSelected === true,
      source: migrateAutoTurbo ? 'v0.3.103-stability-migration' : (performance.source || 'normalized'),
      stabilityRevision: STABILITY_REVISION,
      migratedAt: migrateAutoTurbo ? Date.now() : Number(performance.migratedAt || 0)
    }
  };
}

function normalizePerformancePatch(patch) {
  if (!patch?.performance || patch.performance.mode === undefined) return patch;
  return {
    ...patch,
    performance: {
      ...patch.performance,
      mode: normalizePerformanceMode(patch.performance.mode),
      userSelected: patch.performance.userSelected ?? true,
      autoSelected: patch.performance.autoSelected ?? false,
      source: patch.performance.source || 'user-control',
      stabilityRevision: STABILITY_REVISION,
      selectedAt: Number(patch.performance.selectedAt || Date.now())
    }
  };
}

async function ensureStorageDefaults() {
  const current = await chrome.storage.local.get([STORE_KEYS.state, STORE_KEYS.customPresets, STORE_KEYS.domainEnhancePrefs, STORE_KEYS.privacyConsent]);
  const legacyRoutes = await chrome.storage.local.get('arAudioDomainOutputRoutes');
  if (legacyRoutes.arAudioDomainOutputRoutes) await chrome.storage.local.remove('arAudioDomainOutputRoutes');
  if (!current[STORE_KEYS.state]) {
    lastState = migratePerformanceForStability(prepareStateForStorage(applyInitialPerformanceMode(createDefaultState())));
    await chrome.storage.local.set({ [STORE_KEYS.state]: lastState });
  } else {
    const storedState = current[STORE_KEYS.state];
    lastState = migratePerformanceForStability(prepareStateForStorage({ ...createDefaultState(), ...storedState }));
    if (shouldRefreshFactoryDefaultMaster(storedState)) {
      const defaultPreset = FACTORY_PRESETS.find((preset) => preset.id === 'default') || FACTORY_PRESETS[0];
      const preservedPerformance = lastState.performance;
      lastState = prepareStateForStorage(applyPresetToState(lastState, defaultPreset));
      lastState.performance = preservedPerformance;
    }
    lastState = migratePerformanceForStability(lastState);
    await chrome.storage.local.set({ [STORE_KEYS.state]: lastState });
  }
  if (!current[STORE_KEYS.customPresets]) {
    await chrome.storage.local.set({ [STORE_KEYS.customPresets]: [] });
  }
  if (!current[STORE_KEYS.domainEnhancePrefs]) {
    await chrome.storage.local.set({ [STORE_KEYS.domainEnhancePrefs]: {} });
  }
  const privacy = buildPrivacyStatus(current);
  if (!privacy.accepted && lastState.active) {
    await safeSendMessage({ target: 'offscreen', type: 'STOP_CAPTURE' });
    lastState = prepareStateForStorage({
      ...lastState,
      active: false,
      tabId: null,
      sourceTitle: 'No active capture',
      meters: createSilentMeters(),
      updatedAt: Date.now()
    });
    await chrome.storage.local.set({ [STORE_KEYS.state]: lastState });
  }
  await updateActionVisual(lastState);
}


function buildPrivacyStatus(stored = {}) {
  const consent = stored[STORE_KEYS.privacyConsent] || {};
  const enhancePrefs = stored[STORE_KEYS.domainEnhancePrefs] || {};
  const customPresets = stored[STORE_KEYS.customPresets] || [];
  const siteDomains = new Set(Object.keys(enhancePrefs));
  return {
    accepted: consent.accepted === true && consent.noticeVersion === PRIVACY_NOTICE_VERSION,
    noticeVersion: PRIVACY_NOTICE_VERSION,
    storedNoticeVersion: consent.noticeVersion || '',
    acceptedAt: Number(consent.acceptedAt || 0),
    sitePreferenceCount: siteDomains.size,
    enhancePreferenceCount: Object.keys(enhancePrefs).length,
    customPresetCount: Array.isArray(customPresets) ? customPresets.length : 0
  };
}

async function getPrivacyStatus() {
  const stored = await chrome.storage.local.get([
    STORE_KEYS.privacyConsent,
    STORE_KEYS.domainEnhancePrefs,
    STORE_KEYS.customPresets
  ]);
  return buildPrivacyStatus(stored);
}

async function assertPrivacyConsent() {
  const privacy = await getPrivacyStatus();
  if (!privacy.accepted) {
    throw new Error('Review and accept the local-processing privacy notice before starting audio enhancement.');
  }
  return privacy;
}

async function acceptPrivacyNotice() {
  await chrome.storage.local.set({
    [STORE_KEYS.privacyConsent]: {
      accepted: true,
      noticeVersion: PRIVACY_NOTICE_VERSION,
      acceptedAt: Date.now()
    }
  });
  return { ok: true, privacy: await getPrivacyStatus(), state: await getStateWithPresets() };
}

async function clearSitePreferences() {
  await chrome.storage.local.set({ [STORE_KEYS.domainEnhancePrefs]: {} });
  await chrome.storage.local.remove('arAudioDomainOutputRoutes');
  return { ok: true, privacy: await getPrivacyStatus(), state: await getStateWithPresets() };
}

async function resetAllLocalData() {
  await safeSendMessage({ target: 'offscreen', type: 'STOP_CAPTURE' });
  await chrome.storage.local.clear();
  if (chrome.storage?.session) await chrome.storage.session.clear().catch(() => {});
  lastState = createDefaultState();
  studioTabId = null;
  await ensureStorageDefaults();
  return { ok: true, privacy: await getPrivacyStatus(), state: await getStateWithPresets() };
}

async function handleBackgroundMessage(message, sender = null) {
  await ensureStorageDefaults();
  switch (message.type) {
    case 'GET_STATE':
      return { ok: true, state: await getStateWithPresets() };
    case 'GET_PRIVACY_STATUS':
      return { ok: true, privacy: await getPrivacyStatus() };
    case 'ACCEPT_PRIVACY_NOTICE':
      return acceptPrivacyNotice();
    case 'CLEAR_SITE_PREFERENCES':
      return clearSitePreferences();
    case 'RESET_ALL_LOCAL_DATA':
      return resetAllLocalData();
    case 'OPEN_PRIVACY_POLICY':
      await chrome.tabs.create({ url: PRIVACY_POLICY_URL, active: true });
      return { ok: true };
    case 'OPEN_SUPPORT_PAGE':
      await chrome.tabs.create({ url: SUPPORT_DEVELOPMENT_URL, active: true });
      return { ok: true };
    case 'START_ENHANCE':
      await assertPrivacyConsent();
      return startEnhance(message.sourceTabId);
    case 'STOP_ENHANCE':
      return stopEnhance();
    case 'OPEN_STUDIO':
      return openStudioSingleton();
    case 'REGISTER_STUDIO':
      if (sender?.tab?.id) await rememberStudioTabId(sender.tab.id);
      return { ok: true };
    case 'APPLY_PRESET':
      return applyPresetCommand(message.preset || await findPresetById(message.presetId));
    case 'UPDATE_STATE':
      return updateStateCommand(message.patch || {});
    case 'SAVE_CUSTOM_PRESET':
      return saveCustomPreset(message.preset);
    default:
      throw new Error(`Unknown background message: ${message.type}`);
  }
}

async function getStateWithPresets() {
  const stored = await chrome.storage.local.get([
    STORE_KEYS.state,
    STORE_KEYS.customPresets,
    STORE_KEYS.domainEnhancePrefs,
    STORE_KEYS.privacyConsent
  ]);
  const customPresets = stored[STORE_KEYS.customPresets] || [];
  const domainEnhancePrefs = stored[STORE_KEYS.domainEnhancePrefs] || {};
  const privacy = buildPrivacyStatus(stored);
  lastState = prepareStateForStorage({ ...createDefaultState(), ...(stored[STORE_KEYS.state] || lastState) });
  const availablePresets = [...FACTORY_PRESETS, ...customPresets];
  if (!availablePresets.some((preset) => preset.id === lastState.selectedPresetId)) {
    lastState = prepareStateForStorage(applyPresetToState(lastState, FACTORY_PRESETS.find((preset) => preset.id === 'default') || FACTORY_PRESETS[0]));
    await chrome.storage.local.set({ [STORE_KEYS.state]: lastState });
  }

  const activeWebTab = privacy.accepted ? await getActiveWebTab() : null;
  const captureTab = privacy.accepted ? await getCaptureTabFromState(lastState) : null;
  const activeDomain = getDomainFromUrl(activeWebTab?.url || '');
  const captureDomain = getDomainFromUrl(captureTab?.url || '');
  const contextDomain = activeDomain || captureDomain || '';

  const currentTabId = Number(activeWebTab?.id);
  const captureTabId = Number(lastState.tabId);
  const isCurrentTabCapture = Boolean(
    lastState.active &&
    Number.isInteger(currentTabId) &&
    Number.isInteger(captureTabId) &&
    currentTabId === captureTabId
  );
  const domainEnhance = privacy.accepted && contextDomain ? domainEnhancePrefs[contextDomain] : null;

  return {
    ...lastState,
    presets: [...FACTORY_PRESETS, ...customPresets],
    currentDomain: contextDomain,
    currentTabId: Number.isInteger(currentTabId) ? currentTabId : null,
    currentTabTitle: activeWebTab?.title || '',
    captureDomain: captureDomain || '',
    captureTabId: Number.isInteger(captureTabId) ? captureTabId : null,
    isCurrentTabCapture,
    isSameDomainCapture: Boolean(activeDomain && captureDomain && activeDomain === captureDomain),
    domainEnhanceEnabled: Boolean(domainEnhance?.enabled),
    domainEnhanceUpdatedAt: Number(domainEnhance?.updatedAt || 0),
    privacy
  };
}

async function openStudioSingleton() {
  if (openingStudioPromise) return openingStudioPromise;
  openingStudioPromise = openStudioSingletonCore().finally(() => {
    openingStudioPromise = null;
  });
  return openingStudioPromise;
}

async function openStudioSingletonCore() {
  const privacyAccepted = (await getPrivacyStatus()).accepted;
  const sourceTabId = privacyAccepted ? await getActiveCaptureCandidateTabId() : null;
  const path = sourceTabId ? `studio.html?sourceTabId=${sourceTabId}` : 'studio.html';
  const desiredUrl = chrome.runtime.getURL(path);
  const existing = await findExistingStudioTab();
  if (existing?.id) {
    await rememberStudioTabId(existing.id);
    await focusStudioTab(existing, desiredUrl, sourceTabId);
    await closeDuplicateStudioTabs(existing.id);
    return { ok: true, reused: true, tabId: existing.id };
  }

  const created = await chrome.tabs.create({ url: desiredUrl, active: true });
  await rememberStudioTabId(created?.id || null);
  return { ok: true, reused: false, tabId: studioTabId };
}

async function focusStudioTab(tab, desiredUrl, sourceTabId) {
  const currentUrl = tab.pendingUrl || tab.url || '';
  const update = { active: true };
  if (!currentUrl || shouldUpdateStudioSourceUrl(currentUrl, sourceTabId)) {
    update.url = desiredUrl;
  }
  await chrome.tabs.update(tab.id, update);
  if (tab.windowId && chrome.windows?.update) {
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  }
}

async function findExistingStudioTab() {
  const studioUrl = chrome.runtime.getURL('studio.html');
  const candidateIds = new Set();

  const storedTabId = await getStoredStudioTabId();
  if (storedTabId) candidateIds.add(Number(storedTabId));
  if (studioTabId) candidateIds.add(Number(studioTabId));

  for (const tabId of await findStudioTabIdsFromRuntimeContexts()) {
    candidateIds.add(Number(tabId));
  }

  for (const tabId of await findStudioTabIdsByTabQuery(studioUrl)) {
    candidateIds.add(Number(tabId));
  }

  for (const tabId of candidateIds) {
    const tab = await getValidStudioTab(tabId, studioUrl);
    if (tab?.id) {
      await rememberStudioTabId(tab.id);
      return tab;
    }
  }

  await clearStoredStudioTabId();
  return null;
}

async function getValidStudioTab(tabId, studioUrl) {
  if (!tabId) return null;
  try {
    const tab = await chrome.tabs.get(Number(tabId));
    const tabUrl = tab?.pendingUrl || tab?.url || '';
    // When Chrome does not expose tab.url without the tabs permission, a tab id
    // that came from storage.session or runtime.getContexts is still trusted for
    // this browser session. If a URL is visible, require the studio URL prefix.
    if (!tabUrl || tabUrl.startsWith(studioUrl)) return tab;
  } catch {
    return null;
  }
  return null;
}

async function findStudioTabIdsFromRuntimeContexts() {
  if (!chrome.runtime.getContexts) return [];
  try {
    const studioUrl = chrome.runtime.getURL('studio.html');
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['TAB'] });
    return (contexts || [])
      .filter((context) => String(context.documentUrl || '').startsWith(studioUrl))
      .map((context) => context.tabId)
      .filter((tabId) => Number.isInteger(tabId) && tabId > 0);
  } catch {
    return [];
  }
}

async function findStudioTabIdsByTabQuery(studioUrl) {
  try {
    const tabs = await chrome.tabs.query({ url: `${studioUrl}*` });
    return (tabs || []).map((tab) => tab.id).filter((tabId) => Number.isInteger(tabId) && tabId > 0);
  } catch {
    // URL-scoped tab queries can be unavailable without the tabs permission.
    return [];
  }
}

async function closeDuplicateStudioTabs(keepTabId) {
  const studioUrl = chrome.runtime.getURL('studio.html');
  const ids = new Set([...(await findStudioTabIdsFromRuntimeContexts()), ...(await findStudioTabIdsByTabQuery(studioUrl))]);
  ids.delete(Number(keepTabId));
  const duplicateIds = [...ids].filter((tabId) => Number.isInteger(tabId) && tabId > 0);
  if (!duplicateIds.length) return;
  await chrome.tabs.remove(duplicateIds).catch(() => {});
}

async function getStoredStudioTabId() {
  if (!chrome.storage?.session) return studioTabId;
  try {
    const stored = await chrome.storage.session.get(STORE_KEYS.studioTabId);
    const tabId = Number(stored?.[STORE_KEYS.studioTabId]);
    return Number.isInteger(tabId) && tabId > 0 ? tabId : studioTabId;
  } catch {
    return studioTabId;
  }
}

async function rememberStudioTabId(tabId) {
  const id = Number(tabId);
  studioTabId = Number.isInteger(id) && id > 0 ? id : null;
  if (!chrome.storage?.session) return;
  if (studioTabId) {
    await chrome.storage.session.set({ [STORE_KEYS.studioTabId]: studioTabId }).catch(() => {});
  } else {
    await chrome.storage.session.remove(STORE_KEYS.studioTabId).catch(() => {});
  }
}

async function clearStoredStudioTabId() {
  studioTabId = null;
  if (chrome.storage?.session) await chrome.storage.session.remove(STORE_KEYS.studioTabId).catch(() => {});
}

function shouldUpdateStudioSourceUrl(currentUrl, sourceTabId) {
  if (!sourceTabId) return false;
  try {
    const parsed = new URL(currentUrl);
    if (!parsed.pathname.endsWith('/studio.html')) return true;
    return Number(parsed.searchParams.get('sourceTabId')) !== Number(sourceTabId);
  } catch {
    return true;
  }
}

async function getActiveWebTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return isCapturableTab(tab) ? tab : null;
  } catch {
    return null;
  }
}

async function getCaptureTabFromState(state) {
  const tabId = Number(state?.tabId);
  if (!Number.isInteger(tabId) || tabId <= 0) return null;
  try {
    const tab = await chrome.tabs.get(tabId);
    return isCapturableTab(tab) ? tab : null;
  } catch {
    return null;
  }
}


async function getActiveCaptureCandidateTabId() {
  const tab = await getActiveWebTab();
  return tab?.id || null;
}

async function resolveCaptureTab(sourceTabId = null) {
  const requestedTabId = Number(sourceTabId);
  if (Number.isInteger(requestedTabId) && requestedTabId > 0) {
    try {
      const requested = await chrome.tabs.get(requestedTabId);
      if (isCapturableTab(requested)) return requested;
    } catch {
      // Fall back to the active tab below.
    }
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isCapturableTab(tab) {
  if (!tab?.id || !tab?.url) return false;
  try {
    const parsed = new URL(tab.url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function cleanupCaptureBeforeStart() {
  await safeSendMessage({ target: 'offscreen', type: 'STOP_CAPTURE' });
  lastState = prepareStateForStorage({
    ...lastState,
    active: false,
    tabId: null,
    sourceTitle: 'No active capture',
    meters: createSilentMeters(),
    updatedAt: Date.now()
  });
  await chrome.storage.local.set({ [STORE_KEYS.state]: lastState });
  await sleep(60);
}

async function requestCaptureStreamIdWithRetry(tabId) {
  try {
    return await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  } catch (error) {
    const message = error?.message || String(error);
    if (!/active stream/i.test(message)) throw error;
    await cleanupCaptureBeforeStart();
    return chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  }
}

async function cleanupFailedStart() {
  await safeSendMessage({ target: 'offscreen', type: 'STOP_CAPTURE' });
  lastState = prepareStateForStorage({
    ...lastState,
    active: false,
    tabId: null,
    sourceTitle: 'No active capture',
    meters: createSilentMeters(),
    updatedAt: Date.now()
  });
  await chrome.storage.local.set({ [STORE_KEYS.state]: lastState });
}

async function startEnhance(sourceTabId = null) {
  await assertPrivacyConsent();
  const tab = await resolveCaptureTab(sourceTabId);
  if (!tab?.id) {
    throw new Error('No active tab found. Open a tab with audio first.');
  }

  if (!isCapturableTab(tab)) {
    throw new Error('Open a normal web audio tab first, then start from the extension popup or Studio.');
  }

  const storedState = await chrome.storage.local.get(STORE_KEYS.state);
  const current = prepareStateForStorage({ ...createDefaultState(), ...(storedState[STORE_KEYS.state] || lastState) });
  const sameLiveTab = Boolean(current.active && Number(current.tabId) === Number(tab.id) && await hasOffscreenDocument());
  if (sameLiveTab) {
    lastState = prepareStateForStorage({
      ...current,
      output: { ...current.output, bypass: false },
      active: true,
      tabId: tab.id,
      sourceTitle: tab.title || current.sourceTitle || 'Current tab',
      updatedAt: Date.now()
    });
    await chrome.storage.local.set({ [STORE_KEYS.state]: lastState });
    await sendToOffscreenIfActive({ target: 'offscreen', type: 'UPDATE_STATE', patch: { output: { bypass: false } } }).catch(() => {});
    await saveDomainEnhancePreference(tab, true);
    await updateActionVisual(lastState);
    return { ok: true, state: await getStateWithPresets() };
  }

  await ensureOffscreenDocument();
  await cleanupCaptureBeforeStart();

  const streamId = await requestCaptureStreamIdWithRetry(tab.id);
  const title = tab.title || 'Current tab';
  const stateBeforeStart = prepareStateForStorage({
    ...(await getStateWithPresets()),
    output: { ...(lastState.output || {}), bypass: false }
  });

  let response = null;
  try {
    response = await sendMessageWithResponse({
      target: 'offscreen',
      type: 'START_CAPTURE',
      streamId,
      tabId: tab.id,
      sourceTitle: title,
      initialState: stateBeforeStart
    });
  } catch (error) {
    await cleanupFailedStart();
    throw error;
  }

  if (!response?.ok) {
    await cleanupFailedStart();
    throw new Error(response?.error || 'Unable to start audio engine. Reload the extension and try again.');
  }

  lastState = prepareStateForStorage({
    ...lastState,
    active: true,
    tabId: tab.id,
    sourceTitle: title,
    output: { ...lastState.output, bypass: false },
    updatedAt: Date.now()
  });
  await chrome.storage.local.set({ [STORE_KEYS.state]: lastState });
  await saveDomainEnhancePreference(tab, true);
  await updateActionVisual(lastState);
  return { ok: true, state: await getStateWithPresets() };
}

async function stopEnhance() {
  await safeSendMessage({ target: 'offscreen', type: 'STOP_CAPTURE' });
  lastState = prepareStateForStorage({
    ...lastState,
    active: false,
    tabId: null,
    sourceTitle: 'No active capture',
    meters: createSilentMeters(),
    updatedAt: Date.now()
  });
  await chrome.storage.local.set({ [STORE_KEYS.state]: lastState });
  await updateActionVisual(lastState);
  return { ok: true, state: await getStateWithPresets() };
}

async function markCaptureInactiveIfMatches(tabId) {
  const stored = await chrome.storage.local.get(STORE_KEYS.state);
  const current = prepareStateForStorage({ ...createDefaultState(), ...(stored[STORE_KEYS.state] || lastState) });
  if (!current.active || Number(current.tabId) !== Number(tabId)) return;
  lastState = prepareStateForStorage({
    ...current,
    active: false,
    tabId: null,
    sourceTitle: 'No active capture',
    meters: createSilentMeters(),
    updatedAt: Date.now()
  });
  await chrome.storage.local.set({ [STORE_KEYS.state]: lastState });
  await updateActionVisual(lastState);
}

async function applyPresetCommand(preset) {
  if (!preset) {
    throw new Error('Preset not found.');
  }
  const stored = await chrome.storage.local.get(STORE_KEYS.state);
  lastState = prepareStateForStorage(applyPresetToState({ ...createDefaultState(), ...(stored[STORE_KEYS.state] || lastState) }, preset));
  await chrome.storage.local.set({ [STORE_KEYS.state]: lastState });
  await sendToOffscreenIfActive({ target: 'offscreen', type: 'APPLY_PRESET', preset }).catch(() => {});
  return { ok: true, state: await getStateWithPresets() };
}

async function updateStateCommand(patch) {
  const normalizedPatch = normalizePerformancePatch(patch);
  const stored = await chrome.storage.local.get(STORE_KEYS.state);
  lastState = migratePerformanceForStability(prepareStateForStorage(deepMerge({ ...createDefaultState(), ...(stored[STORE_KEYS.state] || lastState) }, normalizedPatch)));
  lastState.updatedAt = Date.now();
  await chrome.storage.local.set({ [STORE_KEYS.state]: lastState });

  const offscreenResponse = await sendToOffscreenIfActive({ target: 'offscreen', type: 'UPDATE_STATE', patch: normalizedPatch }).catch(() => null);
  if (offscreenResponse?.ok && offscreenResponse.state) {
    lastState = migratePerformanceForStability(prepareStateForStorage({ ...lastState, ...offscreenResponse.state, output: { ...lastState.output, ...offscreenResponse.state.output } }));
    lastState.updatedAt = Date.now();
    await chrome.storage.local.set({ [STORE_KEYS.state]: lastState });
  }

  await updateActionVisual(lastState);
  return { ok: true, state: await getStateWithPresets() };
}


async function saveDomainEnhancePreference(tab, enabled = true) {
  if (!(await getPrivacyStatus()).accepted) return null;
  const domain = getDomainFromUrl(tab?.url || '');
  if (!domain) return null;
  const stored = await chrome.storage.local.get(STORE_KEYS.domainEnhancePrefs);
  const prefs = stored[STORE_KEYS.domainEnhancePrefs] || {};
  prefs[domain] = {
    enabled: Boolean(enabled),
    updatedAt: Date.now()
  };
  await chrome.storage.local.set({ [STORE_KEYS.domainEnhancePrefs]: prefs });
  return prefs[domain];
}


function getDomainFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

async function findPresetById(id) {
  const stored = await chrome.storage.local.get(STORE_KEYS.customPresets);
  const presets = [...FACTORY_PRESETS, ...(stored[STORE_KEYS.customPresets] || [])];
  return presets.find((preset) => preset.id === id);
}

async function sendToOffscreenIfActive(message) {
  if (!(await hasOffscreenDocument())) return null;
  return sendMessageWithResponse(message);
}

async function hasOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_URL);
  if (!chrome.runtime.getContexts) return false;
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });
  return Boolean(existingContexts?.length);
}

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_URL);
  if (await hasOffscreenDocument()) {
    return;
  }

  if (creatingOffscreenDocument) {
    await creatingOffscreenDocument;
    return;
  }

  creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
    justification: 'Consume captured tab audio and process it locally with the Web Audio API.'
  });

  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = null;
  }
}

function sendMessageWithResponse(message) {
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

async function safeSendMessage(message) {
  try {
    await sendMessageWithResponse(message);
  } catch {
    return null;
  }
  return null;
}

function prepareStateForStorage(state) {
  return {
    ...createDefaultState(),
    ...state,
    eq: normalizeEqBands(state.eq),
    compressor: normalizeCompressor(state.compressor),
    color: normalizeColor(state.color),
    width: normalizeWidth(state.width),
    output: normalizeOutput(state.output),
    performance: {
      ...(state.performance || {}),
      mode: normalizePerformanceMode(state.performance?.mode || DEFAULT_PERFORMANCE_MODE),
      stabilityRevision: Number(state.performance?.stabilityRevision || 0)
    }
  };
}

function deepMerge(target, patch) {
  if (!patch || typeof patch !== 'object') return target;
  if (Array.isArray(patch)) return patch;
  const output = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (Array.isArray(value)) {
      output[key] = value.map((item) => (typeof item === 'object' ? { ...item } : item));
    } else if (value && typeof value === 'object') {
      output[key] = deepMerge(target?.[key] || {}, value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

async function saveCustomPreset(preset) {
  if (!preset?.name || !Array.isArray(preset.eq)) {
    throw new Error('Invalid custom preset.');
  }

  const stored = await chrome.storage.local.get(STORE_KEYS.customPresets);
  const current = stored[STORE_KEYS.customPresets] || [];
  const cleanedName = String(preset.name).trim().slice(0, 48);
  const customPreset = {
    ...preset,
    eq: normalizeEqBands(preset.eq),
    compressor: normalizeCompressor(preset.compressor),
    color: normalizeColor(preset.color),
    width: normalizeWidth(preset.width),
    output: normalizeOutput(preset.output),
    id: `custom-${Date.now()}`,
    name: cleanedName,
    description: preset.description || 'Custom tuning',
    custom: true
  };

  const next = [customPreset, ...current].slice(0, 24);
  const storedState = await chrome.storage.local.get(STORE_KEYS.state);
  lastState = prepareStateForStorage({
    ...createDefaultState(),
    ...(storedState[STORE_KEYS.state] || lastState),
    selectedPresetId: customPreset.id,
    eq: customPreset.eq,
    compressor: customPreset.compressor,
    color: customPreset.color,
    width: customPreset.width,
    output: customPreset.output,
    updatedAt: Date.now()
  });
  await chrome.storage.local.set({
    [STORE_KEYS.customPresets]: next,
    [STORE_KEYS.state]: lastState
  });
  await sendToOffscreenIfActive({ target: 'offscreen', type: 'UPDATE_STATE', patch: { selectedPresetId: customPreset.id } }).catch(() => {});
  return { ok: true, presets: [...FACTORY_PRESETS, ...next], state: await getStateWithPresets() };
}
