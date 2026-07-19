import { initializeLocalization, installLiveLocalization } from '../shared/localization.js';

await initializeLocalization({ languageSelect: document.getElementById('languageSelect') });
installLiveLocalization();
await import('./studio.js');
