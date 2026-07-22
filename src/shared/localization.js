const LANGUAGE_STORAGE_KEY = 'arsonkupikLanguage';
const SUPPORTED_LANGUAGES = new Set(['en', 'id']);
const ATTRIBUTE_BINDINGS = Object.freeze([
  ['title', 'i18nTitle'],
  ['aria-label', 'i18nAriaLabel'],
  ['placeholder', 'i18nPlaceholder'],
  ['alt', 'i18nAlt'],
  ['data-tip', 'i18nDataTip']
]);

let activeLanguage = 'en';
let activeMessages = Object.create(null);
let sourceMessages = Object.create(null);

function normalizeLanguage(value) {
  const normalized = String(value || '').trim().toLowerCase().replaceAll('_', '-');
  return normalized === 'id' || normalized.startsWith('id-') ? 'id' : 'en';
}

async function readStoredLanguage() {
  try {
    const stored = await chrome.storage.local.get(LANGUAGE_STORAGE_KEY);
    const value = stored?.[LANGUAGE_STORAGE_KEY];
    return SUPPORTED_LANGUAGES.has(value) ? value : null;
  } catch {
    return null;
  }
}

async function readCatalog(language) {
  const response = await fetch(chrome.runtime.getURL(`_locales/${language}/messages.json`), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load ${language} messages.`);
  const raw = await response.json();
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, String(value?.message || '')]));
}

async function loadCatalogs(language) {
  sourceMessages = await readCatalog('en');
  if (language === 'en') {
    activeMessages = sourceMessages;
    return;
  }
  try {
    activeMessages = await readCatalog(language);
  } catch (error) {
    console.warn('[ArSonKuPik i18n] Falling back to English.', error);
    activeLanguage = 'en';
    activeMessages = sourceMessages;
  }
}

function interpolate(message, params = {}) {
  return String(message || '').replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key) => (
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : ''
  ));
}

export function t(key, params = {}) {
  return interpolate(activeMessages[key] || sourceMessages[key] || key, params);
}

export function getActiveLanguage() {
  return activeLanguage;
}

export async function setLanguagePreference(language) {
  const normalized = normalizeLanguage(language);
  await chrome.storage.local.set({ [LANGUAGE_STORAGE_KEY]: normalized });
  return normalized;
}

export function applyDocumentLocalization(root = document) {
  const scope = root?.documentElement || root;
  if (!scope?.querySelectorAll) return;

  document.documentElement.lang = activeLanguage;
  const titleKey = document.documentElement.dataset.i18nTitle;
  if (titleKey) document.title = t(titleKey);

  scope.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    if (key) element.textContent = t(key);
  });

  for (const [attribute, datasetName] of ATTRIBUTE_BINDINGS) {
    const selector = `[data-${datasetName.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}]`;
    scope.querySelectorAll(selector).forEach((element) => {
      const key = element.dataset[datasetName];
      if (key) element.setAttribute(attribute, t(key));
    });
  }
}

export function bindLanguageSelector(select) {
  if (!select) return;
  select.value = activeLanguage;
  select.setAttribute('aria-label', t('language_label'));
  select.title = t('language_label');
  select.addEventListener('change', async () => {
    select.disabled = true;
    try {
      await setLanguagePreference(select.value);
    } finally {
      location.reload();
    }
  });
}

export async function initializeLocalization({ root = document, languageSelect = null } = {}) {
  const storedLanguage = await readStoredLanguage();
  const browserLanguage = chrome.i18n?.getUILanguage?.() || navigator.language || 'en';
  activeLanguage = storedLanguage || normalizeLanguage(browserLanguage);
  await loadCatalogs(activeLanguage);
  applyDocumentLocalization(root);
  bindLanguageSelector(languageSelect);
  return activeLanguage;
}
