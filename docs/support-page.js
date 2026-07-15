(() => {
  'use strict';

  const config = globalThis.ARSONKUPIK_SUPPORT_CONFIG || {};
  const panel = document.querySelector('[data-qris-panel]');
  const pending = document.querySelector('[data-qris-pending]');
  const image = document.querySelector('[data-qris-image]');
  const merchant = document.querySelector('[data-merchant-name]');
  const city = document.querySelector('[data-merchant-city]');
  const verified = document.querySelector('[data-qris-verified]');
  const amounts = document.querySelector('[data-suggested-amounts]');

  const enabled = config.qrisEnabled === true && typeof config.qrisImage === 'string' && config.qrisImage.trim();
  if (merchant) merchant.textContent = config.merchantName || 'ArSonKuPik';
  if (city) {
    city.textContent = config.merchantCity || '';
    city.hidden = !config.merchantCity;
  }
  if (verified) {
    verified.textContent = config.lastVerified ? `QRIS terakhir diverifikasi: ${config.lastVerified}` : '';
    verified.hidden = !config.lastVerified;
  }
  if (amounts && Array.isArray(config.suggestedAmounts)) {
    amounts.textContent = config.suggestedAmounts
      .filter((value) => Number.isFinite(Number(value)) && Number(value) > 0)
      .map((value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value)))
      .join(' · ');
  }

  if (enabled && image && panel && pending) {
    image.src = config.qrisImage;
    image.alt = `QRIS merchant ${config.merchantName || 'ArSonKuPik'}`;
    image.addEventListener('error', () => {
      panel.hidden = true;
      pending.hidden = false;
      pending.querySelector('strong').textContent = 'QRIS belum dapat ditampilkan';
    }, { once: true });
    panel.hidden = false;
    pending.hidden = true;
  }
})();
