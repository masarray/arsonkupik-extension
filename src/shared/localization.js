const LANGUAGE_STORAGE_KEY = 'arsonkupikLanguage';
const SUPPORTED_LANGUAGES = new Set(['en', 'id']);
const LOCALIZABLE_ATTRIBUTES = ['title', 'aria-label', 'placeholder', 'alt', 'data-tip'];
let activeLanguage = 'en';
let activeMessages = Object.create(null);
let sourceMessages = Object.create(null);
let translationRules = [];
let observer = null;
let applying = false;

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
  try {
    activeMessages = language === 'en' ? sourceMessages : await readCatalog(language);
  } catch {
    activeLanguage = 'en';
    activeMessages = sourceMessages;
  }
  translationRules = buildTranslationRules();
}

function interpolate(message, params = {}) {
  return String(message || '').replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key) => (
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : ''
  ));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTranslationRules() {
  return Object.entries(sourceMessages)
    .filter(([, message]) => message)
    .map(([key, message]) => {
      const names = [];
      const pattern = escapeRegExp(message).replace(/\\\{\\\{([a-zA-Z0-9_]+)\\\}\\\}/g, (_match, name) => {
        names.push(name);
        return '(.+?)';
      });
      return { key, message, names, regex: new RegExp(`^${pattern}$`, 'i') };
    })
    .sort((a, b) => b.message.length - a.message.length);
}

function preserveCase(source, translated) {
  if (source.length > 1 && source === source.toUpperCase() && /[A-Z]/i.test(source)) return translated.toUpperCase();
  return translated;
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

export function translateExistingString(value) {
  if (activeLanguage === 'en') return value;
  const original = String(value ?? '');
  const leading = original.match(/^\s*/)?.[0] || '';
  const trailing = original.match(/\s*$/)?.[0] || '';
  const body = original.slice(leading.length, original.length - trailing.length);
  if (!body) return original;
  for (const rule of translationRules) {
    const match = body.match(rule.regex);
    if (!match) continue;
    const params = Object.fromEntries(rule.names.map((name, index) => [name, match[index + 1]]));
    return `${leading}${preserveCase(body, t(rule.key, params))}${trailing}`;
  }
  return original;
}

function dataAttributeName(attribute) {
  return `i18n${attribute.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('')}`;
}

function applyElementLocalization(element) {
  if (!(element instanceof Element)) return;
  if (element.matches('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  for (const attribute of LOCALIZABLE_ATTRIBUTES) {
    const dataName = dataAttributeName(attribute);
    if (element.dataset[dataName]) element.setAttribute(attribute, t(element.dataset[dataName]));
    else if (element.hasAttribute(attribute)) {
      const current = element.getAttribute(attribute);
      const next = translateExistingString(current);
      if (next !== current) element.setAttribute(attribute, next);
    }
  }
}

function translateNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement;
    if (!parent || parent.closest('script, style, noscript') || parent.dataset.i18n) return;
    const next = translateExistingString(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
    return;
  }
  if (!(node instanceof Element)) return;
  applyElementLocalization(node);
  if (node.dataset.i18n) return;
  for (const child of node.childNodes) translateNode(child);
}

export function applyDocumentLocalization(root = document) {
  applying = true;
  try {
    document.documentElement.lang = activeLanguage;
    const titleKey = document.documentElement.dataset.i18nTitle;
    if (titleKey) document.title = t(titleKey);
    translateNode(root.documentElement || root);
  } finally {
    applying = false;
  }
}

export function bindLanguageSelector(select) {
  if (!select) return;
  select.value = activeLanguage;
  select.setAttribute('aria-label', t('language_label'));
  select.title = t('language_label');
  select.addEventListener('change', async () => {
    select.disabled = true;
    await setLanguagePreference(select.value);
    location.reload();
  });
}

export function installLiveLocalization(root = document.body) {
  observer?.disconnect();
  observer = new MutationObserver((mutations) => {
    if (applying || activeLanguage === 'en') return;
    applying = true;
    try {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') translateNode(mutation.target);
        else if (mutation.type === 'attributes') applyElementLocalization(mutation.target);
        else for (const node of mutation.addedNodes) translateNode(node);
      }
    } finally {
      applying = false;
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: LOCALIZABLE_ATTRIBUTES
  });
  return observer;
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
