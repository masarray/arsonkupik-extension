export const DEFAULT_PERFORMANCE_MODE = 'stable';
export const STABILITY_REVISION = 1;
export const PERFORMANCE_MODE_ORDER = Object.freeze(['stable', 'normal', 'eco']);
export const PERFORMANCE_MODE_LABELS = Object.freeze({
  stable: 'STABLE',
  normal: 'TURBO',
  eco: 'ECO'
});

export function normalizePerformanceMode(mode) {
  return PERFORMANCE_MODE_ORDER.includes(mode) ? mode : DEFAULT_PERFORMANCE_MODE;
}

export function nextPerformanceMode(mode) {
  const normalized = normalizePerformanceMode(mode);
  const index = PERFORMANCE_MODE_ORDER.indexOf(normalized);
  return PERFORMANCE_MODE_ORDER[(index + 1) % PERFORMANCE_MODE_ORDER.length];
}

export function expectedEqNodeCount(band = {}) {
  const type = String(band.type || '').toLowerCase();
  const cut = type === 'lowcut' || type === 'highcut';
  if (!cut) return 1;
  return Math.max(1, Math.round(Number(band.slope || 12) / 12));
}

export function requiresEqTopologyRebuild(nodeGroups = [], bands = []) {
  if (!Array.isArray(nodeGroups) || !Array.isArray(bands)) return true;
  if (nodeGroups.length !== bands.length) return true;
  return bands.some((band, index) => (nodeGroups[index]?.length || 0) !== expectedEqNodeCount(band));
}
