import { initializeLocalization } from '../shared/localization.js';

const root = document.documentElement;
let startupComplete = false;
let startupFailureShown = false;

function showStartupFailure(error) {
  if (startupFailureShown) return;
  startupFailureShown = true;
  const message = error instanceof Error ? error.message : String(error || 'Studio runtime did not finish starting.');
  console.error('[ArSonKuPik Studio startup]', error);

  const banner = document.createElement('section');
  banner.id = 'studioStartupFailure';
  banner.setAttribute('role', 'alert');
  banner.style.cssText = 'position:fixed;z-index:2147483647;left:50%;top:18px;transform:translateX(-50%);max-width:min(680px,calc(100vw - 32px));padding:14px 16px;border:1px solid rgba(255,107,107,.75);border-radius:12px;background:#161018;color:#fff;box-shadow:0 16px 50px rgba(0,0,0,.55);font:13px/1.45 system-ui,sans-serif;';
  banner.innerHTML = '<strong style="display:block;margin-bottom:4px">ArSonKuPik Studio gagal menyelesaikan startup.</strong><span></span><button type="button" style="display:block;margin-top:10px;padding:7px 12px;border:0;border-radius:8px;cursor:pointer;font-weight:700">Muat ulang Studio</button>';
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
  console.warn('[ArSonKuPik i18n] Studio localization failed open.', error);
});

try {
  await import('./studio.js');
  root.dataset.runtimeModule = 'loaded';
} catch (error) {
  root.dataset.runtimeModule = 'failed';
  showStartupFailure(error);
}

void localizationTask;

setTimeout(() => {
  const graphReady = Boolean(document.querySelector('#svg [data-l="grid"]'));
  const presetReady = Boolean(document.querySelector('#masterPresetSelect option'));
  const controlsReady = Boolean(document.querySelector('#compressorControls .knob-control'));
  startupComplete = graphReady && presetReady && controlsReady;
  root.dataset.runtimeReady = startupComplete ? 'true' : 'false';
  if (!startupComplete) {
    showStartupFailure(new Error('Grafik, preset, atau kontrol Studio belum terbentuk. Reload extension lalu buka Studio kembali.'));
  }
}, 5500);
