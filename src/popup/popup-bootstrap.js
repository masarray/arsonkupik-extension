import { initializeLocalization } from '../shared/localization.js';

const root = document.documentElement;
let startupComplete = false;
let startupFailureShown = false;

function showStartupFailure(error) {
  if (startupFailureShown) return;
  startupFailureShown = true;
  const message = error instanceof Error ? error.message : String(error || 'Popup runtime did not finish starting.');
  console.error('[ArSonKuPik Popup startup]', error);

  const banner = document.createElement('section');
  banner.id = 'popupStartupFailure';
  banner.setAttribute('role', 'alert');
  banner.style.cssText = 'position:fixed;z-index:2147483647;left:12px;right:12px;top:12px;padding:12px;border:1px solid rgba(255,107,107,.75);border-radius:10px;background:#161018;color:#fff;box-shadow:0 12px 36px rgba(0,0,0,.55);font:12px/1.4 system-ui,sans-serif;';
  banner.innerHTML = '<strong style="display:block;margin-bottom:4px">ArSonKuPik gagal menyelesaikan startup.</strong><span></span><button type="button" style="display:block;margin-top:8px;padding:6px 10px;border:0;border-radius:7px;cursor:pointer;font-weight:700">Muat ulang</button>';
  banner.querySelector('span').textContent = message;
  banner.querySelector('button').addEventListener('click', () => location.reload());
  document.body.appendChild(banner);
}

window.addEventListener('error', (event) => {
  if (!startupComplete) showStartupFailure(event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  if (!startupComplete) showStartupFailure(event.reason);
});

const localizationTask = initializeLocalization({
  languageSelect: document.getElementById('languageSelect')
}).catch((error) => {
  console.warn('[ArSonKuPik i18n] Popup localization failed open.', error);
});

try {
  await import('./popup.js');
  root.dataset.runtimeModule = 'loaded';
} catch (error) {
  root.dataset.runtimeModule = 'failed';
  showStartupFailure(error);
}

void localizationTask;

setTimeout(() => {
  const presetReady = Boolean(document.querySelector('#presetSelect option'));
  const actionReady = Boolean(document.getElementById('startStopButton'));
  startupComplete = presetReady && actionReady;
  root.dataset.runtimeReady = startupComplete ? 'true' : 'false';
  if (!startupComplete) {
    showStartupFailure(new Error('Preset atau kontrol Popup belum terbentuk. Reload extension lalu coba kembali.'));
  }
}, 5500);
