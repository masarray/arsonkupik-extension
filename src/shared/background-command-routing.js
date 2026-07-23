const SERIALIZED_STATE_COMMANDS = new Set([
  'START_ENHANCE',
  'STOP_ENHANCE',
  'ACCEPT_PRIVACY_NOTICE',
  'CLEAR_SITE_PREFERENCES',
  'RESET_ALL_LOCAL_DATA',
  'SAVE_CUSTOM_PRESET'
]);

export function getBackgroundCommandLane(type) {
  const command = String(type || '');
  if (command === 'UPDATE_STATE') return 'patch';
  if (command === 'APPLY_PRESET') return 'latest-command';
  if (SERIALIZED_STATE_COMMANDS.has(command)) return 'state-command';
  return 'direct';
}

export function isDirectUiCommand(type) {
  return getBackgroundCommandLane(type) === 'direct';
}
